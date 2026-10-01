import { describe, it, expect } from 'vitest';
import react from '../src/index.js';
import { loadSpec, type Logger } from '@o2p/core';
import * as path from 'node:path';

describe('gen-react Generator', () => {
  it('generates query keys, useQuery, useMutation, and context', async () => {
    const specPath = path.resolve(__dirname, '../../../examples/petstore/openapi.yaml');
    const spec = await loadSpec(specPath);

    const configured = react({
      out: './output',
      queryLib: 'tanstack-v5',
    });

    const logger: Logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => logger,
    };

    const files = await configured.generator.generate({
      spec,
      options: configured.generator.optionsSchema.parse(configured.options),
      outDir: './output',
      logger,
    });

    const contextFile = files.find((f) => f.path === 'context.tsx');
    expect(contextFile).toBeDefined();
    expect(contextFile?.content).toContain('export function ApiProvider');
    expect(contextFile?.content).toContain('export function useApi()');

    const hookFile = files.find((f) => f.path.includes('pets.ts'));
    expect(hookFile).toBeDefined();
    expect(hookFile?.content).toContain('petsKeys');
    expect(hookFile?.content).toContain('useListPets');
    expect(hookFile?.content).toContain('useCreatePet');
  });
});
