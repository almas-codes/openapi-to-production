# Contributing to openapi-to-production (`o2p`)

Thank you for your interest in contributing to `o2p`! We welcome contributions of all sizes.

## Development Setup

1. Prerequisites:
   - Node.js 20+
   - pnpm 9+
   - .NET 9.0+ SDK (for .NET generators and test validation)

2. Clone and install:
   ```bash
   git clone https://github.com/almas-codes/openapi-to-production.git
   cd openapi-to-production
   pnpm install
   ```

3. Build and test:
   ```bash
   pnpm turbo run build
   pnpm turbo run test
   ```

## Writing a Custom Generator in 15 Minutes

Generators in `o2p` are pure functions conforming to `Generator<TOpts>`:

```typescript
import { defineGenerator, type GeneratorContext } from '@o2p/core';
import { z } from 'zod';

const optionsSchema = z.object({
  out: z.string().default('./generated'),
});

export default defineGenerator({
  name: 'custom-summary',
  optionsSchema,
  async generate({ spec, options, outDir }: GeneratorContext<z.infer<typeof optionsSchema>>) {
    const summary = `# API Summary: ${spec.info.title}\n\nTotal operations: ${spec.operations.length}\n`;
    return [
      {
        path: 'SUMMARY.md',
        content: summary,
        kind: 'generated',
      },
    ];
  },
});
```

All generators receive the normalized Intermediate Representation (`ApiSpec`) and return an array of `GeneratedFile` objects (`{ path, content, kind }`). Pure functions mean 100% deterministic output and zero file I/O inside the generator.
