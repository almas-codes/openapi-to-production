import { z } from 'zod';
import {
  defineGenerator,
  pascal,
  camel,
  type GeneratorContext,
  type GeneratedFile,
} from '@o2p/core';

export const TestsOptionsSchema = z.object({
  out: z.string(),
  target: z.enum(['dotnet', 'vitest', 'both']).default('both'),
  namespace: z.string().default('Acme.Api.Tests'),
});

export type TestsOptions = z.infer<typeof TestsOptionsSchema>;

export default function tests(options: Partial<TestsOptions> & { out: string }) {
  return {
    generator: defineGenerator({
      name: 'tests',
      optionsSchema: TestsOptionsSchema,
      async generate(ctx: GeneratorContext<TestsOptions>): Promise<GeneratedFile[]> {
        const { spec, options: opts } = ctx;
        const files: GeneratedFile[] = [];

        // 1. .NET Contract Tests (xUnit)
        if (opts.target === 'dotnet' || opts.target === 'both') {
          let dotnetTests = `using System.Net;\nusing System.Threading.Tasks;\nusing Microsoft.AspNetCore.Mvc.Testing;\nusing Xunit;\nusing FluentAssertions;\n\nnamespace ${opts.namespace};\n\npublic class ApiContractTests : IClassFixture<WebApplicationFactory<Program>>\n{\n    private readonly HttpClient _client;\n\n    public ApiContractTests(WebApplicationFactory<Program> factory)\n    {\n        _client = factory.CreateClient();\n    }\n\n`;

          for (const op of spec.operations) {
            const testName = `${pascal(op.id)}_Contract_Test`;
            const route = op.path.replace(/{(\w+)}/g, '1');

            dotnetTests += `    [Fact]\n    public async Task ${testName}()\n    {\n`;
            dotnetTests += `        var response = await _client.${pascal(op.method)}Async("${route}", null);\n`;
            dotnetTests += `        response.StatusCode.Should().NotBe(HttpStatusCode.NotFound);\n`;
            dotnetTests += `    }\n\n`;
          }

          dotnetTests += `}\n`;

          files.push({
            path: 'dotnet/ApiContractTests.cs',
            content: dotnetTests,
            kind: 'generated',
          });
        }

        // 2. Vitest Contract Tests for TypeScript
        if (opts.target === 'vitest' || opts.target === 'both') {
          let vitestCode = `import { describe, it, expect } from 'vitest';\nimport { createClient } from '../client.js';\n\ndescribe('API Client Contract Tests', () => {\n  const client = createClient({ baseUrl: 'http://localhost:5000' });\n\n`;

          for (const op of spec.operations) {
            const tag = camel(op.tag || 'default');
            vitestCode += `  it('should call ${op.id} endpoint correctly', async () => {\n`;
            vitestCode += `    expect(typeof (client.${tag} as any).${camel(op.id)}).toBe('function');\n`;
            vitestCode += `  });\n\n`;
          }

          vitestCode += `});\n`;

          files.push({
            path: 'vitest/client.contract.test.ts',
            content: vitestCode,
            kind: 'generated',
          });
        }

        return files;
      },
    }),
    options,
    outDir: options.out,
  };
}
