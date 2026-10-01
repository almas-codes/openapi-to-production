import { z } from 'zod';
import {
  defineGenerator,
  pascal,
  camel,
  type GeneratorContext,
  type GeneratedFile,
  type Operation,
} from '@o2p/core';

export const ReactOptionsSchema = z.object({
  out: z.string(),
  queryLib: z.enum(['tanstack-v5']).default('tanstack-v5'),
  suspense: z.boolean().default(false),
});

export type ReactOptions = z.infer<typeof ReactOptionsSchema>;

export default function react(options: Partial<ReactOptions> & { out: string }) {
  return {
    generator: defineGenerator({
      name: 'react-hooks',
      dependsOn: ['ts-client'],
      optionsSchema: ReactOptionsSchema,
      async generate(ctx: GeneratorContext<ReactOptions>): Promise<GeneratedFile[]> {
        const { spec } = ctx;
        const files: GeneratedFile[] = [];

        // Group operations by tag
        const groups = new Map<string, Operation[]>();
        for (const op of spec.operations) {
          const tag = op.tag || 'default';
          if (!groups.has(tag)) groups.set(tag, []);
          groups.get(tag)!.push(op);
        }

        // 1. Context and Provider
        const contextTs = `import React, { createContext, useContext } from 'react';\nimport type { ApiClient } from '../client.js';\n\nconst ApiContext = createContext<ApiClient | null>(null);\n\nexport interface ApiProviderProps {\n  client: ApiClient;\n  children: React.ReactNode;\n}\n\nexport function ApiProvider({ client, children }: ApiProviderProps) {\n  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;\n}\n\nexport function useApi(): ApiClient {\n  const ctx = useContext(ApiContext);\n  if (!ctx) throw new Error('useApi must be used within an ApiProvider');\n  return ctx;\n}\n`;

        files.push({
          path: 'context.tsx',
          content: contextTs,
          kind: 'generated',
        });

        // 2. Query hooks per tag
        let indexExports = `export * from './context.js';\n`;

        for (const [tag, ops] of groups.entries()) {
          const tagName = camel(tag);

          let hooksTs = `import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';\nimport { useApi } from './context.js';\nimport type * as types from '../types.js';\nimport type { ApiError } from '../client.js';\n\n`;

          // Keys factory
          hooksTs += `export const ${tagName}Keys = {\n`;
          hooksTs += `  all: ['${tagName}'] as const,\n`;
          hooksTs += `  lists: () => [...${tagName}Keys.all, 'list'] as const,\n`;
          hooksTs += `  list: (params?: unknown) => [...${tagName}Keys.lists(), params] as const,\n`;
          hooksTs += `  details: () => [...${tagName}Keys.all, 'detail'] as const,\n`;
          hooksTs += `  detail: (id: string | number) => [...${tagName}Keys.details(), id] as const,\n`;
          hooksTs += `};\n\n`;

          for (const op of ops) {
            const hookName = `use${pascal(op.id)}`;
            const isQuery = op.method === 'get';

            if (isQuery) {
              hooksTs += `export function ${hookName}(params?: any, options?: Omit<UseQueryOptions<any, ApiError>, 'queryKey' | 'queryFn'>) {\n`;
              hooksTs += `  const api = useApi();\n`;
              hooksTs += `  return useQuery({\n`;
              hooksTs += `    queryKey: ${tagName}Keys.list(params),\n`;
              hooksTs += `    queryFn: () => (api.${tagName} as any).${camel(op.id)}(params),\n`;
              hooksTs += `    ...options,\n`;
              hooksTs += `  });\n}\n\n`;
            } else {
              hooksTs += `export function ${hookName}(options?: UseMutationOptions<any, ApiError, any>) {\n`;
              hooksTs += `  const api = useApi();\n`;
              hooksTs += `  const qc = useQueryClient();\n`;
              hooksTs += `  return useMutation({\n`;
              hooksTs += `    mutationFn: (variables: any) => (api.${tagName} as any).${camel(op.id)}(variables),\n`;
              hooksTs += `    onSuccess: (...args) => {\n`;
              hooksTs += `      qc.invalidateQueries({ queryKey: ${tagName}Keys.all });\n`;
              hooksTs += `      options?.onSuccess?.(...args);\n`;
              hooksTs += `    },\n`;
              hooksTs += `    ...options,\n`;
              hooksTs += `  });\n}\n\n`;
            }
          }

          files.push({
            path: `${tagName}.ts`,
            content: hooksTs,
            kind: 'generated',
          });

          indexExports += `export * from './${tagName}.js';\n`;
        }

        files.push({
          path: 'index.ts',
          content: indexExports,
          kind: 'generated',
        });

        return files;
      },
    }),
    options,
    outDir: options.out,
  };
}
