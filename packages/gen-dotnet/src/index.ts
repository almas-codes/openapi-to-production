import { z } from 'zod';
import {
  defineGenerator,
  pascal,
  camel,
  type GeneratorContext,
  type GeneratedFile,
  type Operation,
} from '@o2p/core';
import { csType } from './type-map.js';

export const DotnetOptionsSchema = z.object({
  out: z.string(),
  namespace: z.string().default('Acme.Api'),
  framework: z.string().default('net10.0'),
  validation: z.enum(['fluent', 'none']).default('fluent'),
  problemDetails: z.boolean().default(true),
});

export type DotnetOptions = z.infer<typeof DotnetOptionsSchema>;

export default function dotnet(options: Partial<DotnetOptions> & { out: string }) {
  return {
    generator: defineGenerator({
      name: 'dotnet-api',
      optionsSchema: DotnetOptionsSchema,
      async generate(ctx: GeneratorContext<DotnetOptions>): Promise<GeneratedFile[]> {
        const files: GeneratedFile[] = [];
        const { spec, options: opts } = ctx;
        const ns = opts.namespace;

        // Group operations by tag
        const groups = new Map<string, Operation[]>();
        for (const op of spec.operations) {
          const tag = op.tag || 'Default';
          if (!groups.has(tag)) groups.set(tag, []);
          groups.get(tag)!.push(op);
        }

        // 1. Generate Models (DTOs and Enums)
        let modelsContent = `#nullable enable\nusing System;\nusing System.Collections.Generic;\nusing System.Text.Json.Serialization;\n\nnamespace ${ns}.Models;\n\n`;

        for (const [name, schemaObj] of Object.entries(spec.schemas)) {
          const s = schemaObj.schema;
          if (s.kind === 'enum') {
            modelsContent += `[JsonConverter(typeof(JsonStringEnumConverter))]\npublic enum ${pascal(name)}\n{\n`;
            for (const val of s.values) {
              modelsContent += `    ${pascal(String(val))},\n`;
            }
            modelsContent += `}\n\n`;
          } else if (s.kind === 'object') {
            modelsContent += `public sealed record ${pascal(name)}(\n`;
            const propLines = s.properties.map((p) => {
              const pType = csType(p.schema, p.required);
              return `    [property: JsonPropertyName("${p.name}")] ${pType} ${pascal(p.name)}`;
            });
            modelsContent += propLines.join(',\n');
            modelsContent += `);\n\n`;
          }
        }

        files.push({
          path: 'Models/GeneratedModels.cs',
          content: modelsContent,
          kind: 'generated',
        });

        // 2. Generate FluentValidation Validators
        if (opts.validation === 'fluent') {
          let valContent = `#nullable enable\nusing FluentValidation;\nusing ${ns}.Models;\n\nnamespace ${ns}.Validators;\n\n`;
          for (const [name, schemaObj] of Object.entries(spec.schemas)) {
            if (schemaObj.schema.kind === 'object') {
              valContent += `public sealed class ${pascal(name)}Validator : AbstractValidator<${pascal(name)}>\n{\n    public ${pascal(name)}Validator()\n    {\n`;
              for (const p of schemaObj.schema.properties) {
                const rules: string[] = [];
                if (p.required) rules.push('.NotNull()');
                if (p.schema.kind === 'primitive' && p.schema.constraints) {
                  const c = p.schema.constraints;
                  if (c.minLength) rules.push(`.MinimumLength(${c.minLength})`);
                  if (c.maxLength) rules.push(`.MaximumLength(${c.maxLength})`);
                  if (c.pattern) rules.push(`.Matches(@"${c.pattern}")`);
                  if (c.minimum !== undefined) rules.push(`.GreaterThanOrEqualTo(${c.minimum})`);
                  if (c.maximum !== undefined) rules.push(`.LessThanOrEqualTo(${c.maximum})`);
                }
                if (rules.length > 0) {
                  valContent += `        RuleFor(x => x.${pascal(p.name)})${rules.join('')};\n`;
                }
              }
              valContent += `    }\n}\n\n`;
            }
          }
          files.push({
            path: 'Validators/GeneratedValidators.cs',
            content: valContent,
            kind: 'generated',
          });
        }

        // 3. Generate Controllers and Service Interfaces per tag
        for (const [tag, ops] of groups.entries()) {
          const tagName = pascal(tag);

          // Service Interface (generated)
          let svcInterface = `#nullable enable\nusing System.Threading;\nusing System.Threading.Tasks;\nusing ${ns}.Models;\n\nnamespace ${ns}.Services;\n\npublic interface I${tagName}Service\n{\n`;
          for (const op of ops) {
            const resp = op.responses.find((r) => r.status.startsWith('2')) || op.responses[0];
            const retType = resp?.schema ? csType(resp.schema, true) : 'void';
            const asyncRet = retType === 'void' ? 'Task' : `Task<${retType}>`;

            const paramsList = op.parameters.map((p) => `${csType(p.schema, p.required)} ${camel(p.name)}`);
            if (op.requestBody) {
              paramsList.push(`${csType(op.requestBody.schema, true)} body`);
            }
            paramsList.push('CancellationToken ct = default');

            svcInterface += `    ${asyncRet} ${pascal(op.id)}Async(${paramsList.join(', ')});\n`;
          }
          svcInterface += `}\n`;

          files.push({
            path: `Services/Generated/I${tagName}Service.cs`,
            content: svcInterface,
            kind: 'generated',
          });

          // Service Scaffold (written once)
          let svcScaffold = `#nullable enable\nusing System;\nusing System.Threading;\nusing System.Threading.Tasks;\nusing ${ns}.Models;\n\nnamespace ${ns}.Services;\n\npublic class ${tagName}Service : I${tagName}Service\n{\n`;
          for (const op of ops) {
            const resp = op.responses.find((r) => r.status.startsWith('2')) || op.responses[0];
            const retType = resp?.schema ? csType(resp.schema, true) : 'void';
            const asyncRet = retType === 'void' ? 'Task' : `Task<${retType}>`;
            const paramsList = op.parameters.map((p) => `${csType(p.schema, p.required)} ${camel(p.name)}`);
            if (op.requestBody) {
              paramsList.push(`${csType(op.requestBody.schema, true)} body`);
            }
            paramsList.push('CancellationToken ct = default');

            svcScaffold += `    public virtual ${asyncRet} ${pascal(op.id)}Async(${paramsList.join(', ')})\n    {\n        throw new NotImplementedException("TODO: Implement ${pascal(op.id)}");\n    }\n\n`;
          }
          svcScaffold += `}\n`;

          files.push({
            path: `Services/${tagName}Service.cs`,
            content: svcScaffold,
            kind: 'scaffold',
          });

          // Controller Base (generated)
          let ctrlBase = `#nullable enable\nusing System.Threading;\nusing System.Threading.Tasks;\nusing Microsoft.AspNetCore.Mvc;\nusing ${ns}.Models;\nusing ${ns}.Services;\n\nnamespace ${ns}.Controllers.Generated;\n\n[ApiController]\n[Route("api/[controller]")]\npublic abstract class ${tagName}ControllerBase : ControllerBase\n{\n    protected readonly I${tagName}Service Service;\n    protected ${tagName}ControllerBase(I${tagName}Service service) => Service = service;\n\n`;

          for (const op of ops) {
            const resp = op.responses.find((r) => r.status.startsWith('2')) || op.responses[0];
            const retType = resp?.schema ? csType(resp.schema, true) : 'void';
            const actionRet = retType === 'void' ? 'Task<IActionResult>' : `Task<ActionResult<${retType}>>`;

            ctrlBase += `    [Http${pascal(op.method)}("${op.path.replace(/^\//, '')}")]\n`;
            const actionParams = op.parameters.map((p) => `[From${pascal(p.in)}] ${csType(p.schema, p.required)} ${camel(p.name)}`);
            if (op.requestBody) {
              actionParams.push(`[FromBody] ${csType(op.requestBody.schema, true)} body`);
            }
            actionParams.push('CancellationToken ct = default');

            const callArgs = op.parameters.map((p) => camel(p.name));
            if (op.requestBody) callArgs.push('body');
            callArgs.push('ct');

            ctrlBase += `    public virtual async ${actionRet} ${pascal(op.id)}(${actionParams.join(', ')})\n    {\n`;
            if (retType === 'void') {
              ctrlBase += `        await Service.${pascal(op.id)}Async(${callArgs.join(', ')});\n        return NoContent();\n    }\n\n`;
            } else {
              ctrlBase += `        var result = await Service.${pascal(op.id)}Async(${callArgs.join(', ')});\n        return Ok(result);\n    }\n\n`;
            }
          }
          ctrlBase += `}\n`;

          files.push({
            path: `Controllers/Generated/${tagName}ControllerBase.cs`,
            content: ctrlBase,
            kind: 'generated',
          });

          // Controller Scaffold (written once)
          const ctrlScaffold = `#nullable enable\nusing Microsoft.AspNetCore.Mvc;\nusing ${ns}.Services;\n\nnamespace ${ns}.Controllers;\n\npublic sealed class ${tagName}Controller(I${tagName}Service service)\n    : Generated.${tagName}ControllerBase(service);\n`;

          files.push({
            path: `Controllers/${tagName}Controller.cs`,
            content: ctrlScaffold,
            kind: 'scaffold',
          });
        }

        // 4. Generate DI Extension
        let diContent = `#nullable enable\nusing Microsoft.Extensions.DependencyInjection;\nusing FluentValidation;\nusing ${ns}.Services;\n\nnamespace ${ns};\n\npublic static class GeneratedApiExtensions\n{\n    public static IServiceCollection AddGeneratedApi(this IServiceCollection services)\n    {\n`;
        for (const tag of groups.keys()) {
          const tagName = pascal(tag);
          diContent += `        services.AddScoped<I${tagName}Service, ${tagName}Service>();\n`;
        }
        if (opts.validation === 'fluent') {
          diContent += `        services.AddValidatorsFromAssemblyContaining<GeneratedApiExtensions>();\n`;
        }
        diContent += `        return services;\n    }\n}\n`;

        files.push({
          path: 'GeneratedApiExtensions.cs',
          content: diContent,
          kind: 'generated',
        });

        // 5. Scaffold Project & Program.cs
        const csprojContent = `<Project Sdk="Microsoft.NET.Sdk.Web">\n  <PropertyGroup>\n    <TargetFramework>${opts.framework}</TargetFramework>\n    <Nullable>enable</Nullable>\n    <ImplicitUsings>enable</ImplicitUsings>\n  </PropertyGroup>\n  <ItemGroup>\n    <PackageReference Include="FluentValidation.AspNetCore" Version="11.3.0" />\n  </ItemGroup>\n</Project>\n`;
        files.push({
          path: `${ns}.csproj`,
          content: csprojContent,
          kind: 'scaffold',
        });

        const programContent = `using ${ns};\n\nvar builder = WebApplication.CreateBuilder(args);\nbuilder.Services.AddControllers();\nbuilder.Services.AddGeneratedApi();\n\nvar app = builder.Build();\napp.MapControllers();\napp.Run();\n`;
        files.push({
          path: 'Program.cs',
          content: programContent,
          kind: 'scaffold',
        });

        return files;
      },
    }),
    options,
    outDir: options.out,
  };
}
