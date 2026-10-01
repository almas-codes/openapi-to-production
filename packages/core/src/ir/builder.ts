import type {
  ApiSpec,
  Constraints,
  NamedSchema,
  Operation,
  Parameter,
  Property,
  Schema,
  SecurityScheme
} from './types.js';
import { pascal } from '../naming/index.js';

interface RawOpenApiSpec {
  info?: { title?: string; version?: string; description?: string };
  servers?: { url?: string; description?: string }[];
  tags?: { name?: string; description?: string }[];
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

export class IrBuilder {
  private hoistedSchemas: Record<string, NamedSchema> = {};
  private rawComponents: Record<string, unknown> = {};

  public build(raw: RawOpenApiSpec): ApiSpec {
    this.hoistedSchemas = {};
    this.rawComponents = raw.components?.schemas ?? {};

    // 1. Process all declared component schemas
    for (const [name, rawSchema] of Object.entries(this.rawComponents)) {
      const normalized = this.normalizeSchema(rawSchema as Record<string, unknown>, pascal(name), true);
      this.hoistedSchemas[pascal(name)] = {
        name: pascal(name),
        schema: normalized,
        description: (rawSchema as Record<string, unknown>)?.description as string | undefined,
      };
    }

    // 2. Process all paths & operations
    const operations: Operation[] = [];
    const paths = raw.paths ?? {};

    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
      for (const method of methods) {
        const rawOp = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
        if (!rawOp) continue;

        const tag = Array.isArray(rawOp.tags) && rawOp.tags.length > 0 ? String(rawOp.tags[0]) : 'Default';
        const opId = (rawOp.operationId as string) || `${method}${pascal(pathStr.replace(/[^a-zA-Z0-9]/g, ''))}`;

        // Parameters
        const parameters: Parameter[] = [];
        const rawParams = Array.isArray(rawOp.parameters) ? rawOp.parameters : [];
        for (const p of rawParams) {
          const paramObj = p as Record<string, unknown>;
          const pName = String(paramObj.name);
          const pIn = paramObj.in as Parameter['in'];
          const pRequired = Boolean(paramObj.required || pIn === 'path');
          const pSchema = this.normalizeSchema(
            (paramObj.schema as Record<string, unknown>) ?? { type: 'string' },
            `${pascal(opId)}${pascal(pName)}Param`
          );

          parameters.push({
            name: pName,
            in: pIn,
            required: pRequired,
            schema: pSchema,
            description: paramObj.description as string | undefined,
          });
        }

        // Request Body
        let requestBody: Operation['requestBody'] | undefined;
        if (rawOp.requestBody && typeof rawOp.requestBody === 'object') {
          const rb = rawOp.requestBody as Record<string, unknown>;
          const content = rb.content as Record<string, { schema?: Record<string, unknown> }> | undefined;
          if (content) {
            const contentType = Object.keys(content)[0] || 'application/json';
            const rawBodySchema = content[contentType]?.schema ?? { type: 'object' };
            const bodySchema = this.normalizeSchema(rawBodySchema, `${pascal(opId)}Request`);
            requestBody = {
              required: Boolean(rb.required),
              contentType,
              schema: bodySchema,
            };
          }
        }

        // Responses
        const responses: Operation['responses'] = [];
        const rawResponses = (rawOp.responses as Record<string, Record<string, unknown>>) ?? {};
        for (const [status, rObj] of Object.entries(rawResponses)) {
          let rSchema: Schema | undefined;
          let rContentType: string | undefined;

          if (rObj && typeof rObj === 'object') {
            const content = rObj.content as Record<string, { schema?: Record<string, unknown> }> | undefined;
            if (content) {
              rContentType = Object.keys(content)[0] || 'application/json';
              const rawRespSchema = content[rContentType]?.schema;
              if (rawRespSchema) {
                rSchema = this.normalizeSchema(rawRespSchema, `${pascal(opId)}${status}Response`);
              }
            }
          }

          responses.push({
            status,
            description: (rObj?.description as string) || '',
            schema: rSchema,
            contentType: rContentType,
          });
        }

        // Security
        const security: string[] = [];
        if (Array.isArray(rawOp.security)) {
          for (const s of rawOp.security) {
            security.push(...Object.keys(s as Record<string, unknown>));
          }
        }

        operations.push({
          id: opId,
          tag: pascal(tag),
          method,
          path: pathStr,
          summary: rawOp.summary as string | undefined,
          deprecated: Boolean(rawOp.deprecated),
          parameters,
          requestBody,
          responses,
          security,
        });
      }
    }

    // 3. Process Security Schemes
    const securitySchemes: Record<string, SecurityScheme> = {};
    if (raw.components?.securitySchemes) {
      for (const [key, val] of Object.entries(raw.components.securitySchemes)) {
        const sObj = val as Record<string, unknown>;
        if (sObj.type === 'http') {
          securitySchemes[key] = {
            type: 'http',
            scheme: (sObj.scheme as 'bearer' | 'basic') || 'bearer',
          };
        } else if (sObj.type === 'apiKey') {
          securitySchemes[key] = {
            type: 'apiKey',
            in: (sObj.in as 'header' | 'query') || 'header',
            name: (sObj.name as string) || 'X-API-Key',
          };
        } else if (sObj.type === 'oauth2') {
          securitySchemes[key] = {
            type: 'oauth2',
            flows: sObj.flows,
          };
        }
      }
    }

    // Sort operations deterministically for 100% reproducible diffs
    operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

    return {
      info: {
        title: raw.info?.title || 'API',
        version: raw.info?.version || '1.0.0',
        description: raw.info?.description,
      },
      servers: (raw.servers || []).map((s) => ({ url: s.url || '/', description: s.description })),
      tags: (raw.tags || []).map((t) => ({ name: pascal(t.name || ''), description: t.description })),
      operations,
      schemas: this.hoistedSchemas,
      securitySchemes,
    };
  }

  private normalizeSchema(raw: Record<string, unknown>, contextName: string, isTopLevel = false): Schema {
    if (!raw || typeof raw !== 'object') {
      return { kind: 'primitive', type: 'string' };
    }

    // Handle $ref
    if (raw.$ref && typeof raw.$ref === 'string') {
      const parts = raw.$ref.split('/');
      const refName = pascal(parts[parts.length - 1]);
      return { kind: 'ref', name: refName };
    }

    // Handle allOf (merge)
    if (Array.isArray(raw.allOf)) {
      const mergedProps: Property[] = [];
      const requiredSet = new Set<string>();

      for (const sub of raw.allOf) {
        const normalizedSub = this.normalizeSchema(sub as Record<string, unknown>, contextName);
        if (normalizedSub.kind === 'object') {
          for (const prop of normalizedSub.properties) {
            mergedProps.push(prop);
            if (prop.required) requiredSet.add(prop.name);
          }
        }
      }

      return {
        kind: 'object',
        properties: mergedProps,
      };
    }

    // Handle oneOf / anyOf (union)
    if (Array.isArray(raw.oneOf) || Array.isArray(raw.anyOf)) {
      const variants = ((raw.oneOf || raw.anyOf) as Record<string, unknown>[]).map((v, i) =>
        this.normalizeSchema(v, `${contextName}Variant${i + 1}`)
      );
      const disc = raw.discriminator as { propertyName?: string; mapping?: Record<string, string> } | undefined;

      return {
        kind: 'union',
        variants,
        discriminator: disc?.propertyName
          ? { property: disc.propertyName, mapping: disc.mapping ?? {} }
          : undefined,
      };
    }

    // Determine nullability (OpenAPI 3.0 nullable vs 3.1 type: [string, null])
    let nullable = Boolean(raw.nullable);
    let type = raw.type;
    if (Array.isArray(type)) {
      nullable = type.includes('null');
      type = type.find((t) => t !== 'null') || 'string';
    }

    // Constraints extraction
    const constraints: Constraints = {};
    if (typeof raw.minLength === 'number') constraints.minLength = raw.minLength;
    if (typeof raw.maxLength === 'number') constraints.maxLength = raw.maxLength;
    if (typeof raw.pattern === 'string') constraints.pattern = raw.pattern;
    if (typeof raw.minimum === 'number') constraints.minimum = raw.minimum;
    if (typeof raw.maximum === 'number') constraints.maximum = raw.maximum;

    // Handle enums
    if (Array.isArray(raw.enum)) {
      const enumValues = raw.enum as (string | number)[];
      const baseType = typeof enumValues[0] === 'number' ? 'integer' : 'string';
      const enumSchema: Schema = {
        kind: 'enum',
        values: enumValues,
        baseType,
        nullable,
      };

      if (isTopLevel) {
        return enumSchema;
      }

      // Hoist anonymous inline enums to named schemas
      if (!this.hoistedSchemas[contextName]) {
        this.hoistedSchemas[contextName] = {
          name: contextName,
          schema: enumSchema,
        };
        return { kind: 'ref', name: contextName, nullable };
      }
      return enumSchema;
    }

    // Handle arrays
    if (type === 'array' || raw.items) {
      const itemSchema = this.normalizeSchema(
        (raw.items as Record<string, unknown>) ?? { type: 'string' },
        `${contextName}Item`
      );
      return {
        kind: 'array',
        items: itemSchema,
        constraints: {
          minItems: typeof raw.minItems === 'number' ? raw.minItems : undefined,
          maxItems: typeof raw.maxItems === 'number' ? raw.maxItems : undefined,
        },
        nullable,
      };
    }

    // Handle objects
    if (type === 'object' || raw.properties) {
      const rawProps = (raw.properties as Record<string, Record<string, unknown>>) ?? {};
      const requiredFields = new Set(Array.isArray(raw.required) ? raw.required.map(String) : []);
      const properties: Property[] = [];

      for (const [propName, propDef] of Object.entries(rawProps)) {
        properties.push({
          name: propName,
          required: requiredFields.has(propName),
          schema: this.normalizeSchema(propDef, `${contextName}${pascal(propName)}`),
          description: propDef.description as string | undefined,
        });
      }

      let additionalProperties: Schema | undefined;
      if (raw.additionalProperties && typeof raw.additionalProperties === 'object') {
        additionalProperties = this.normalizeSchema(
          raw.additionalProperties as Record<string, unknown>,
          `${contextName}Value`
        );
      }

      const objSchema: Schema = {
        kind: 'object',
        properties,
        additionalProperties,
        nullable,
      };

      if (isTopLevel) {
        return objSchema;
      }

      // Hoist anonymous inline objects if they are complex
      if (properties.length > 0 && !this.hoistedSchemas[contextName] && !contextName.endsWith('Param')) {
        this.hoistedSchemas[contextName] = {
          name: contextName,
          schema: objSchema,
        };
        return { kind: 'ref', name: contextName, nullable };
      }

      return objSchema;
    }

    // Handle primitives
    const primType = type === 'integer' || type === 'number' || type === 'boolean' ? type : 'string';
    return {
      kind: 'primitive',
      type: primType,
      format: raw.format as string | undefined,
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
      nullable,
    };
  }
}
