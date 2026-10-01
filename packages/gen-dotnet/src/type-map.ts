import type { Schema } from '@o2p/core';
import { pascal } from '@o2p/core';

export function csType(s: Schema, required = true): string {
  const nullable = !required || (s.kind === 'primitive' && Boolean(s.nullable));
  const q = nullable ? '?' : '';

  switch (s.kind) {
    case 'primitive':
      if (s.type === 'string') {
        if (s.format === 'date-time') return `DateTimeOffset${q}`;
        if (s.format === 'date') return `DateOnly${q}`;
        if (s.format === 'uuid') return `Guid${q}`;
        if (s.format === 'binary') return 'IFormFile';
        return `string${q}`;
      }
      if (s.type === 'integer') return `${s.format === 'int64' ? 'long' : 'int'}${q}`;
      if (s.type === 'number') return `${s.format === 'float' ? 'float' : 'double'}${q}`;
      if (s.type === 'boolean') return `bool${q}`;
      return `string${q}`;
    case 'array':
      return `IReadOnlyList<${csType(s.items, true)}>${q}`;
    case 'ref':
      return `${pascal(s.name)}${q}`;
    case 'enum':
      return `string${q}`;
    case 'union':
      return `object${q}`;
    case 'object':
      return s.additionalProperties
        ? `Dictionary<string, ${csType(s.additionalProperties, true)}>${q}`
        : `object${q}`;
  }
}
