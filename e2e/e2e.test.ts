import { describe, it, expect } from 'vitest';
import { loadSpec, runPipeline, type Logger } from '@o2p/core';
import dotnet from '@o2p/gen-dotnet';
import tsClient from '@o2p/gen-ts-client';
import react from '@o2p/gen-react';
import nextjs from '@o2p/gen-nextjs';
import tests from '@o2p/gen-tests';
import postman from '@o2p/gen-postman';
import docs from '@o2p/gen-docs';
import * as path from 'node:path';

describe('E2E Full-Stack Generation Pipeline', () => {
  it('runs all 7 generators in topology and verifies output consistency', async () => {
    const specPath = path.resolve(__dirname, '../examples/ecommerce/openapi.yaml');
    const spec = await loadSpec(specPath);

    const generators = [
      dotnet({ out: './temp/backend', namespace: 'Commerce.Api' }),
      tsClient({ out: './temp/client', zod: true }),
      react({ out: './temp/client/hooks', queryLib: 'tanstack-v5' }),
      nextjs({ out: './temp/client/next' }),
      tests({ out: './temp/tests', target: 'both' }),
      postman({ out: './temp/postman' }),
      docs({ out: './temp/docs' }),
    ];

    const logger: Logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => logger,
    };

    const result = await runPipeline(
      {
        input: specPath,
        generators,
        dryRun: true,
        logger,
      },
      spec
    );

    expect(result.files.length).toBeGreaterThanOrEqual(25);
    // Verify no duplicates
    const paths = result.files.map((f) => f.absPath);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });
});
