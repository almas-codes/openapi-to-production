import { z } from 'zod';
import {
  defineGenerator,
  type GeneratorContext,
  type GeneratedFile,
} from '@o2p/core';

export const DocsOptionsSchema = z.object({
  out: z.string(),
  title: z.string().optional(),
});

export type DocsOptions = z.infer<typeof DocsOptionsSchema>;

export default function docs(options: Partial<DocsOptions> & { out: string }) {
  return {
    generator: defineGenerator({
      name: 'docs',
      optionsSchema: DocsOptionsSchema,
      async generate(ctx: GeneratorContext<DocsOptions>): Promise<GeneratedFile[]> {
        const { spec, options: opts } = ctx;
        const files: GeneratedFile[] = [];

        // 1. Markdown Documentation
        let mdContent = `# ${opts.title || spec.info.title}\n\n`;
        mdContent += `> Version: ${spec.info.version}\n\n`;
        if (spec.info.description) {
          mdContent += `${spec.info.description}\n\n`;
        }

        mdContent += `## Endpoints Summary\n\n`;
        mdContent += `| Method | Path | Summary | Tag |\n`;
        mdContent += `| --- | --- | --- | --- |\n`;
        for (const op of spec.operations) {
          mdContent += `| \`${op.method.toUpperCase()}\` | \`${op.path}\` | ${op.summary || '-'} | ${op.tag} |\n`;
        }
        mdContent += `\n`;

        files.push({
          path: 'API.md',
          content: mdContent,
          kind: 'generated',
        });

        // 2. Standalone HTML Documentation Viewer
        const htmlContent = `<!doctype html>
<html>
  <head>
    <title>${opts.title || spec.info.title} - API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="./openapi.json">
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

        files.push({
          path: 'index.html',
          content: htmlContent,
          kind: 'generated',
        });

        return files;
      },
    }),
    options,
    outDir: options.out,
  };
}
