import { describe, it, expect } from 'vitest';
import dotnet from '../src/index.js';
import { loadSpec, type Logger } from '@o2p/core';
import * as path from 'node:path';

describe('gen-dotnet Generator', () => {
  it('generates controller bases, models, and interfaces from spec', async () => {
    const specPath = path.resolve(__dirname, '../../../examples/petstore/openapi.yaml');
    const spec = await loadSpec(specPath);

    const configured = dotnet({
      out: './output',
      namespace: 'Petstore.Api',
      framework: 'net10.0',
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

    expect(files.length).toBeGreaterThan(0);
    const modelFile = files.find((f) => f.path.includes('GeneratedModels.cs'));
    expect(modelFile).toBeDefined();
    expect(modelFile?.content).toContain('public sealed record Pet(');
    expect(modelFile?.content).toContain('public enum PetStatus');

    const controllerBase = files.find((f) => f.path.includes('PetsControllerBase.cs'));
    expect(controllerBase).toBeDefined();
    expect(controllerBase?.content).toContain('public abstract class PetsControllerBase : ControllerBase');
  });
});
