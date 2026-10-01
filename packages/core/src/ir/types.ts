export interface ApiSpec {
  info: { title: string; version: string; description?: string };
  servers: { url: string; description?: string }[];
  tags: { name: string; description?: string }[];
  operations: Operation[];
  schemas: Record<string, NamedSchema>;
  securitySchemes: Record<string, SecurityScheme>;
}

export interface Operation {
  id: string; // operationId (required; lint enforces)
  tag: string; // first tag -> controller / client group
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string; // /pets/{petId}
  summary?: string;
  deprecated: boolean;
  parameters: Parameter[];
  requestBody?: { required: boolean; contentType: string; schema: Schema };
  responses: { status: string; description: string; schema?: Schema; contentType?: string }[];
  security: string[];
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: Schema;
  description?: string;
}

export type Schema =
  | {
      kind: 'primitive';
      type: 'string' | 'integer' | 'number' | 'boolean';
      format?: string;
      constraints?: Constraints;
      nullable?: boolean;
    }
  | {
      kind: 'array';
      items: Schema;
      constraints?: { minItems?: number; maxItems?: number };
      nullable?: boolean;
    }
  | {
      kind: 'object';
      properties: Property[];
      additionalProperties?: Schema;
      nullable?: boolean;
    }
  | {
      kind: 'enum';
      values: (string | number)[];
      baseType: 'string' | 'integer';
      nullable?: boolean;
    }
  | {
      kind: 'union';
      variants: Schema[];
      discriminator?: { property: string; mapping: Record<string, string> };
      nullable?: boolean;
    }
  | {
      kind: 'ref';
      name: string;
      nullable?: boolean;
    };

export interface Property {
  name: string;
  required: boolean;
  schema: Schema;
  description?: string;
}

export interface NamedSchema {
  name: string;
  schema: Schema;
  description?: string;
}

export interface Constraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
}

export type SecurityScheme =
  | { type: 'http'; scheme: 'bearer' | 'basic' }
  | { type: 'apiKey'; in: 'header' | 'query'; name: string }
  | { type: 'oauth2'; flows: unknown };
