import { z } from 'zod';
import {
  defineGenerator,
  pascal,
  camel,
  type GeneratorContext,
  type GeneratedFile,
  type Schema,
  type Operation,
} from '@o2p/core';

export const TsClientOptionsSchema = z.object({
  out: z.string(),
  zod: z.boolean().default(true),
  baseUrlEnv: z.string().optional(),
});

export type TsClientOptions = z.infer<typeof TsClientOptionsSchema>;

function tsType(s: Schema): string {
  const q = s.nullable ? ' | null' : '';
  switch (s.kind) {
    case 'primitive':
      if (s.type === 'string') return `string${q}`;
      if (s.type === 'integer' || s.type === 'number') return `number${q}`;
      if (s.type === 'boolean') return `boolean${q}`;
      return `unknown${q}`;
    case 'array':
      return `Array<${tsType(s.items)}>${q}`;
    case 'ref':
      return `${pascal(s.name)}${q}`;
    case 'enum':
      return s.values.map((v) => JSON.stringify(v)).join(' | ') + q;
    case 'union':
      return s.variants.map(tsType).join(' | ') + q;
    case 'object':
      return s.additionalProperties
        ? `Record<string, ${tsType(s.additionalProperties)}>${q}`
        : `Record<string, unknown>${q}`;
  }
}

function zodSchema(s: Schema): string {
  let base: string;
  switch (s.kind) {
    case 'primitive':
      if (s.type === 'string') {
        base = 'z.string()';
        if (s.constraints?.minLength) base += `.min(${s.constraints.minLength})`;
        if (s.constraints?.maxLength) base += `.max(${s.constraints.maxLength})`;
        if (s.constraints?.pattern) base += `.regex(/${s.constraints.pattern}/)`;
      } else if (s.type === 'integer') {
        base = 'z.number().int()';
        if (s.constraints?.minimum !== undefined) base += `.min(${s.constraints.minimum})`;
        if (s.constraints?.maximum !== undefined) base += `.max(${s.constraints.maximum})`;
      } else if (s.type === 'number') {
        base = 'z.number()';
      } else if (s.type === 'boolean') {
        base = 'z.boolean()';
      } else {
        base = 'z.unknown()';
      }
      break;
    case 'array':
      base = `z.array(${zodSchema(s.items)})`;
      break;
    case 'ref':
      base = `${pascal(s.name)}Schema`;
      break;
    case 'enum':
      base = `z.enum([${s.values.map((v) => JSON.stringify(v)).join(', ')}])`;
      break;
    case 'union':
      base = `z.union([${s.variants.map(zodSchema).join(', ')}])`;
      break;
    case 'object':
      base = s.additionalProperties
        ? `z.record(z.string(), ${zodSchema(s.additionalProperties)})`
        : 'z.record(z.string(), z.unknown())';
      break;
  }
  if (s.nullable) {
    base += '.nullable()';
  }
  return base;
}

export default function tsClient(options: Partial<TsClientOptions> & { out: string }) {
  return {
    generator: defineGenerator({
      name: 'ts-client',
      optionsSchema: TsClientOptionsSchema,
      async generate(ctx: GeneratorContext<TsClientOptions>): Promise<GeneratedFile[]> {
        const { spec, options: opts } = ctx;
        const files: GeneratedFile[] = [];

        // 1. Generate Models and Zod schemas
        let modelsTs = `import { z } from 'zod';\n\n`;

        for (const [name, schemaObj] of Object.entries(spec.schemas)) {
          const s = schemaObj.schema;
          const typeName = pascal(name);

          if (s.kind === 'enum') {
            modelsTs += `export const ${typeName}Schema = z.enum([${s.values.map((v) => JSON.stringify(v)).join(', ')}]);\n`;
            modelsTs += `export type ${typeName} = z.infer<typeof ${typeName}Schema>;\n\n`;
          } else if (s.kind === 'object') {
            modelsTs += `export const ${typeName}Schema = z.object({\n`;
            for (const prop of s.properties) {
              let pZod = zodSchema(prop.schema);
              if (!prop.required) pZod += '.optional()';
              modelsTs += `  ${JSON.stringify(prop.name)}: ${pZod},\n`;
            }
            modelsTs += `});\n`;
            modelsTs += `export type ${typeName} = z.infer<typeof ${typeName}Schema>;\n\n`;
          }
        }

        files.push({
          path: 'types.ts',
          content: modelsTs,
          kind: 'generated',
        });

        // 2. Group operations by tag
        const groups = new Map<string, Operation[]>();
        for (const op of spec.operations) {
          const tag = op.tag || 'default';
          if (!groups.has(tag)) groups.set(tag, []);
          groups.get(tag)!.push(op);
        }

        // 3. Generate Client
        const defaultBaseUrl = spec.servers[0]?.url || 'http://localhost:5000';
        let clientTs = `import { z } from 'zod';\nimport * as types from './types.js';\n\n`;
        clientTs += `export interface ProblemDetails {\n  type?: string;\n  title?: string;\n  status?: number;\n  detail?: string;\n  instance?: string;\n  [key: string]: unknown;\n}\n\n`;
        clientTs += `export class ApiError extends Error {\n  constructor(public status: number, public body: unknown, public problem?: ProblemDetails) {\n    super(problem?.title ?? \`HTTP \${status}\`);\n    this.name = 'ApiError';\n  }\n}\n\n`;
        clientTs += `export interface ClientOptions {\n  baseUrl?: string;\n  getToken?: () => string | Promise<string | undefined>;\n  fetch?: typeof fetch;\n}\n\n`;

        clientTs += `export function createClient(opts: ClientOptions = {}) {\n`;
        clientTs += `  const baseUrl = opts.baseUrl || ${opts.baseUrlEnv ? `process.env.${opts.baseUrlEnv} || ` : ''}'${defaultBaseUrl}';\n`;
        clientTs += `  const f = opts.fetch ?? fetch;\n\n`;
        clientTs += `  async function request<T>(method: string, path: string, init: RequestInit & { query?: Record<string, unknown>; schema?: z.ZodType<T> }): Promise<T> {\n`;
        clientTs += `    const url = new URL(path.startsWith('/') ? path : '/' + path, baseUrl);\n`;
        clientTs += `    for (const [k, v] of Object.entries(init.query ?? {})) {\n      if (v !== undefined) url.searchParams.set(k, String(v));\n    }\n`;
        clientTs += `    const token = await opts.getToken?.();\n`;
        clientTs += `    const res = await f(url.toString(), {\n      ...init,\n      method,\n      headers: {\n        'content-type': 'application/json',\n        ...(token ? { authorization: \`Bearer \${token}\` } : {}),\n        ...init.headers,\n      },\n    });\n`;
        clientTs += `    if (!res.ok) {\n      const errBody = await res.json().catch(() => undefined);\n      throw new ApiError(res.status, errBody, errBody as ProblemDetails);\n    }\n`;
        clientTs += `    if (res.status === 204) return undefined as T;\n`;
        clientTs += `    const json = await res.json();\n`;
        clientTs += `    return init.schema ? init.schema.parse(json) : (json as T);\n  }\n\n`;

        clientTs += `  return {\n`;
        for (const [tag, ops] of groups.entries()) {
          clientTs += `    ${camel(tag)}: {\n`;
          for (const op of ops) {
            const resp = op.responses.find((r) => r.status.startsWith('2'));
            const retType = resp?.schema ? tsType(resp.schema) : 'void';
            const schemaLookup = resp?.schema && resp.schema.kind === 'ref'
              ? `types.${pascal(resp.schema.name)}Schema`
              : 'undefined';

            const queryParams = op.parameters.filter((p) => p.in === 'query');
            const pathParams = op.parameters.filter((p) => p.in === 'path');

            const argsDef: string[] = [];
            for (const p of pathParams) {
              argsDef.push(`${camel(p.name)}: ${tsType(p.schema)}`);
            }
            if (op.requestBody) {
              argsDef.push(`body: ${tsType(op.requestBody.schema)}`);
            }
            if (queryParams.length > 0) {
              argsDef.push(`query?: Record<string, unknown>`);
            }

            let pathExpr = `\`${op.path.replace(/{(\w+)}/g, '${encodeURIComponent(String($1))}')}\``;

            clientTs += `      ${camel(op.id)}: (${argsDef.join(', ')}) =>\n`;
            clientTs += `        request<${retType}>('${op.method.toUpperCase()}', ${pathExpr}, {\n`;
            if (op.requestBody) clientTs += `          body: JSON.stringify(body),\n`;
            if (queryParams.length > 0) clientTs += `          query,\n`;
            if (schemaLookup !== 'undefined') clientTs += `          schema: ${schemaLookup},\n`;
            clientTs += `        }),\n`;
          }
          clientTs += `    },\n`;
        }
        clientTs += `  };\n}\n\n`;
        clientTs += `export type ApiClient = ReturnType<typeof createClient>;\n`;

        files.push({
          path: 'client.ts',
          content: clientTs,
          kind: 'generated',
        });

        // 4. Index export
        files.push({
          path: 'index.ts',
          content: `export * from './types.js';\nexport * from './client.js';\n`,
          kind: 'generated',
        });

        return files;
      },
    }),
    options,
    outDir: options.out,
  };
}
