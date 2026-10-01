import { z } from 'zod';
import type { ConfiguredGenerator } from '../pipeline/topo-sort.js';

export interface UserConfig {
  input: string;
  generators: ConfiguredGenerator[];
  lint?: {
    requireOperationIds?: boolean;
    requireExamples?: 'warn' | 'error' | 'off';
    noDuplicateOperationIds?: boolean;
    consistentNaming?: boolean;
  };
}

export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

export const ConfigSchema = z.object({
  input: z.string(),
  generators: z.array(z.any()),
  lint: z
    .object({
      requireOperationIds: z.boolean().optional(),
      requireExamples: z.enum(['warn', 'error', 'off']).optional(),
      noDuplicateOperationIds: z.boolean().optional(),
      consistentNaming: z.boolean().optional(),
    })
    .optional(),
});
