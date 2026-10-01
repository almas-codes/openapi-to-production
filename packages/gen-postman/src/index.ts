import { z } from 'zod';
import {
  defineGenerator,
  type GeneratorContext,
  type GeneratedFile,
  type Operation,
} from '@o2p/core';

export const PostmanOptionsSchema = z.object({
  out: z.string(),
  name: z.string().optional(),
});

export type PostmanOptions = z.infer<typeof PostmanOptionsSchema>;

export default function postman(options: Partial<PostmanOptions> & { out: string }) {
  return {
    generator: defineGenerator({
      name: 'postman',
      optionsSchema: PostmanOptionsSchema,
      async generate(ctx: GeneratorContext<PostmanOptions>): Promise<GeneratedFile[]> {
        const { spec, options: opts } = ctx;
        const files: GeneratedFile[] = [];

        // Group operations by tag
        const groups = new Map<string, Operation[]>();
        for (const op of spec.operations) {
          const tag = op.tag || 'General';
          if (!groups.has(tag)) groups.set(tag, []);
          groups.get(tag)!.push(op);
        }

        const items: any[] = [];
        for (const [tag, ops] of groups.entries()) {
          const tagItem = {
            name: tag,
            item: ops.map((op) => ({
              name: op.summary || op.id,
              request: {
                method: op.method.toUpperCase(),
                url: {
                  raw: `{{baseUrl}}${op.path}`,
                  host: ['{{baseUrl}}'],
                  path: op.path.split('/').filter(Boolean),
                  query: op.parameters
                    .filter((p) => p.in === 'query')
                    .map((p) => ({ key: p.name, value: '', description: p.description })),
                },
                header: [{ key: 'Content-Type', value: 'application/json' }],
                auth: op.security.length > 0 ? { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] } : undefined,
                body: op.requestBody ? { mode: 'raw', raw: '{}' } : undefined,
              },
              event: [
                {
                  listen: 'test',
                  script: {
                    exec: [
                      `pm.test("Status code is valid", function () {`,
                      `    pm.expect([${op.responses.map((r) => r.status).join(', ')}]).to.include(String(pm.response.code));`,
                      `});`,
                    ],
                  },
                },
              ],
            })),
          };
          items.push(tagItem);
        }

        const collection = {
          info: {
            name: opts.name || spec.info.title || 'API Collection',
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
          },
          item: items,
        };

        files.push({
          path: 'collection.json',
          content: JSON.stringify(collection, null, 2),
          kind: 'generated',
        });

        const environment = {
          name: `${opts.name || spec.info.title || 'API'} Environment`,
          values: [
            { key: 'baseUrl', value: spec.servers[0]?.url || 'http://localhost:5000', enabled: true },
            { key: 'token', value: '', enabled: true },
          ],
        };

        files.push({
          path: 'environment.json',
          content: JSON.stringify(environment, null, 2),
          kind: 'generated',
        });

        return files;
      },
    }),
    options,
    outDir: options.out,
  };
}
