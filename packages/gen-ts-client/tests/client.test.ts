import { describe, it, expect } from 'vitest';
import tsClient from '../src/index.js';
import { loadSpec, type Logger } from '@o2p/core';
import * as path from 'node:path';

describe('gen-ts-client Generator', () => {
  it('generates types, zod schemas, and client functions', async () => {
    const specPath = path.resolve(__dirname, '../../../examples/petstore/openapi.yaml');
    const spec = await loadSpec(specPath);

    const configured = tsClient({
      out: './output',
      zod: true,
      baseUrlEnv: 'API_URL',
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

    const typesFile = files.find((f) => f.path === 'types.ts');
    expect(typesFile).toBeDefined();
    expect(typesFile?.content).toContain('export const PetSchema = z.object({');
    expect(typesFile?.content).toContain('export type Pet = z.infer<typeof PetSchema>;');

    const clientFile = files.find((f) => f.path === 'client.ts');
    expect(clientFile).toBeDefined();
    expect(clientFile?.content).toContain('export function createClient');
    expect(clientFile?.content).toContain('export class ApiError extends Error');
  });
});
