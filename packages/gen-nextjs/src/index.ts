import { z } from 'zod';
import {
  defineGenerator,
  camel,
  type GeneratorContext,
  type GeneratedFile,
} from '@o2p/core';

export const NextjsOptionsSchema = z.object({
  out: z.string(),
  actions: z.boolean().default(true),
});

export type NextjsOptions = z.infer<typeof NextjsOptionsSchema>;

export default function nextjs(options: Partial<NextjsOptions> & { out: string }) {
  return {
    generator: defineGenerator({
      name: 'nextjs',
      dependsOn: ['ts-client'],
      optionsSchema: NextjsOptionsSchema,
      async generate(ctx: GeneratorContext<NextjsOptions>): Promise<GeneratedFile[]> {
        const { spec } = ctx;
        const files: GeneratedFile[] = [];

        // Server Actions generator
        let actionsTs = `'use server';\n\nimport { createClient } from '../client.js';\n\nconst client = createClient();\n\n`;

        for (const op of spec.operations) {
          const actionName = `${camel(op.id)}Action`;
          const tag = camel(op.tag || 'default');
          actionsTs += `export async function ${actionName}(payload?: any) {\n`;
          actionsTs += `  try {\n`;
          actionsTs += `    const result = await (client.${tag} as any).${camel(op.id)}(payload);\n`;
          actionsTs += `    return { success: true, data: result };\n`;
          actionsTs += `  } catch (error: any) {\n`;
          actionsTs += `    return { success: false, error: error.message || 'Operation failed' };\n`;
          actionsTs += `  }\n`;
          actionsTs += `}\n\n`;
        }

        files.push({
          path: 'actions.ts',
          content: actionsTs,
          kind: 'generated',
        });

        return files;
      },
    }),
    options,
    outDir: options.out,
  };
}
