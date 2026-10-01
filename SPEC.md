# openapi-to-production (`o2p`)

> One `openapi.yaml` in → a **production-grade, regenerable full-stack** out: ASP.NET Core API, typed TypeScript client, React/Next.js hooks, DTOs, validation, tests, Postman collection, docs and a mock server.

**This file is the master brief for Cursor.** Put it in the repo root as `SPEC.md`, then feed it the phase prompts in Section 12 one at a time.

---

## 1. What makes this different from NSwag / openapi-generator

| Typical generator | `o2p` |
|---|---|
| Template-per-language, no shared model | **Single Intermediate Representation (IR)**; every generator consumes the IR |
| Overwrites your code on regen | **Safe regeneration**: generated code is separated from user code, hash-protected, with conflict detection |
| Generates stubs only | Generates **client + server + validation + tests + mock + docs** that agree with each other |
| No drift detection | `o2p check` fails CI if code drifts from the spec |
| Closed | **Plugin API** for custom generators |
| Output "works on my machine" | Generated output is **compiled and tested in CI** (`dotnet build`, `tsc`, `vitest`) |

### Headline features
1. `o2p init`: interactive config creation
2. `o2p generate`: run all or selected generators
3. `o2p check`: detect spec ↔ code drift (CI-friendly exit codes)
4. `o2p mock`: spec-driven mock server with realistic fake data and validation
5. `o2p lint`: spec quality rules (missing operationIds, missing examples, etc.)
6. `o2p diff old.yaml new.yaml`: breaking-change detection
7. `--watch` mode for regeneration on spec change
8. Plugin system: `o2p-plugin-*` packages

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict), Node 20+ |
| Monorepo | pnpm workspaces + Turborepo |
| Spec parsing | `@apidevtools/swagger-parser` (validate + bundle + dereference-optional) |
| CLI | `commander` + `@clack/prompts` + `picocolors` |
| Templates | `handlebars` (+ typed helpers) for C#; TS emitted via `ts-morph` or template strings |
| Config validation | `zod` |
| Tests | `vitest`, snapshot (golden) tests, `execa` for E2E |
| Mock server | `fastify` + `@faker-js/faker` + `ajv` |
| Generated React | `@tanstack/react-query` v5 |
| Generated validation | `zod` (TS) and `FluentValidation` (C#) |
| Generated .NET tests | xUnit + `WebApplicationFactory` + FluentAssertions |
| Docs | Markdown + static HTML via Scalar/Redoc bundle |
| Lint/format | ESLint (flat config), Prettier, `dotnet format` |
| Release | Changesets + GitHub Actions + npm provenance |

---

## 3. Architecture

```
                        ┌───────────────────────────┐
 openapi.yaml ─────────▶│ 1. Loader                 │  load, bundle $refs, validate
                        └─────────────┬─────────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │ 2. IR Builder             │  normalize → ApiSpec (language-neutral)
                        │  - resolve allOf/oneOf    │
                        │  - name anonymous schemas │
                        │  - detect enums/nullable  │
                        └─────────────┬─────────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │ 3. Pipeline Orchestrator  │  topo-sort generators by dependsOn
                        └─────────────┬─────────────┘
          ┌──────────┬──────────┬─────┴─────┬───────────┬──────────┬─────────┐
          ▼          ▼          ▼           ▼           ▼          ▼         ▼
      dotnet-api  ts-client  react-hooks  nextjs   validation   tests   postman/docs/mock
          └──────────┴──────────┴─────┬─────┴───────────┴──────────┴─────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │ 4. Safe File Writer       │  hash headers, scaffold-once,
                        │                           │  conflict detection, dry-run, diff
                        └───────────────────────────┘
```

### Key design decisions (document these as ADRs in `docs/adr/`)
- **ADR-001 IR-first design**: generators never touch raw OpenAPI.
- **ADR-002 Generated vs. scaffold files**: `generated` is always overwritten; `scaffold` is written once and never touched.
- **ADR-003 .NET pattern**: generate `abstract ControllerBase` + `IXxxService` interface; the user implements the service. Regeneration never clobbers business logic.
- **ADR-004 Generators are pure**: `(IR, options) → GeneratedFile[]`; all I/O lives in the writer. This makes snapshot testing trivial.
- **ADR-005 Output is compiled in CI**: golden snapshots + real compile/test of the output.

---

## 4. Repository layout

```
openapi-to-production/
├─ .cursor/rules/project.mdc
├─ .github/
│  ├─ workflows/{ci.yml,release.yml,codeql.yml}
│  ├─ ISSUE_TEMPLATE/
│  └─ PULL_REQUEST_TEMPLATE.md
├─ packages/
│  ├─ core/                      # loader, IR, pipeline, writer, plugin API
│  │  └─ src/{loader,ir,pipeline,writer,naming,config,types}/
│  ├─ cli/                       # `o2p` binary
│  │  └─ src/commands/{init,generate,check,mock,lint,diff}.ts
│  ├─ gen-dotnet/                # ASP.NET Core API + DTOs + FluentValidation
│  │  └─ src/{index.ts,type-map.ts,templates/*.hbs}
│  ├─ gen-ts-client/             # fetch-based typed client + Zod schemas
│  ├─ gen-react/                 # TanStack Query hooks
│  ├─ gen-nextjs/                # route handlers, server actions, RSC-safe client
│  ├─ gen-tests/                 # xUnit contract tests + vitest/MSW tests
│  ├─ gen-postman/               # Postman v2.1 collection + environment
│  ├─ gen-docs/                  # markdown + static HTML docs
│  └─ mock-server/               # runtime mock (Fastify)
├─ examples/
│  ├─ petstore/openapi.yaml
│  └─ ecommerce/openapi.yaml     # richer: auth, pagination, file upload, polymorphism
├─ e2e/                          # generates examples, then builds + tests the output
├─ docs/{adr/,architecture.md,plugin-authoring.md,config-reference.md}
├─ o2p.config.ts                 # dogfooding
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
├─ README.md  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  LICENSE (MIT)
└─ SPEC.md                       # this file
```

---

## 5. Core code snippets (reference implementations)

### 5.1 Intermediate Representation (`packages/core/src/ir/types.ts`)

```ts
export interface ApiSpec {
  info: { title: string; version: string; description?: string };
  servers: { url: string; description?: string }[];
  tags: { name: string; description?: string }[];
  operations: Operation[];
  schemas: Record<string, NamedSchema>;
  securitySchemes: Record<string, SecurityScheme>;
}

export interface Operation {
  id: string;                       // operationId (required; lint enforces)
  tag: string;                      // first tag → controller / client group
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;                     // /pets/{petId}
  summary?: string;
  deprecated: boolean;
  parameters: Parameter[];
  requestBody?: { required: boolean; contentType: string; schema: Schema };
  responses: { status: string; description: string; schema?: Schema; contentType?: string }[];
  security: string[];
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: Schema;
}

export type Schema =
  | { kind: 'primitive'; type: 'string' | 'integer' | 'number' | 'boolean'; format?: string;
      constraints?: Constraints; nullable?: boolean }
  | { kind: 'array'; items: Schema; constraints?: { minItems?: number; maxItems?: number } }
  | { kind: 'object'; properties: Property[]; additionalProperties?: Schema }
  | { kind: 'enum'; values: (string | number)[]; baseType: 'string' | 'integer' }
  | { kind: 'union'; variants: Schema[]; discriminator?: { property: string; mapping: Record<string, string> } }
  | { kind: 'ref'; name: string };

export interface Property { name: string; required: boolean; schema: Schema; description?: string }
export interface NamedSchema { name: string; schema: Schema; description?: string }
export interface Constraints {
  minLength?: number; maxLength?: number; pattern?: string;
  minimum?: number; maximum?: number; exclusiveMinimum?: boolean; exclusiveMaximum?: boolean;
}
export type SecurityScheme =
  | { type: 'http'; scheme: 'bearer' | 'basic' }
  | { type: 'apiKey'; in: 'header' | 'query'; name: string }
  | { type: 'oauth2'; flows: unknown };
```

### 5.2 Plugin / generator contract (`packages/core/src/types.ts`)

```ts
import type { z } from 'zod';
import type { ApiSpec } from './ir/types';

export type FileKind = 'generated' | 'scaffold';

export interface GeneratedFile {
  path: string;          // relative to output root
  content: string;
  kind: FileKind;        // generated = always overwrite | scaffold = write once
}

export interface GeneratorContext<TOpts> {
  spec: ApiSpec;
  options: TOpts;
  outDir: string;
  logger: Logger;
}

export interface Generator<TOpts = unknown> {
  name: string;                         // "dotnet-api"
  dependsOn?: string[];                 // e.g. react-hooks → ["ts-client"]
  optionsSchema: z.ZodType<TOpts>;
  generate(ctx: GeneratorContext<TOpts>): Promise<GeneratedFile[]>;
}

export const defineGenerator = <T>(g: Generator<T>) => g;
```

### 5.3 Pipeline (`packages/core/src/pipeline/run.ts`)

```ts
export async function runPipeline(cfg: ResolvedConfig, spec: ApiSpec): Promise<PipelineResult> {
  const ordered = topoSort(cfg.generators);               // throws on cycles / missing deps
  const results: PipelineResult = { files: [], conflicts: [], skipped: [] };

  // Generators are pure → safe to run independent ones in parallel layers.
  for (const layer of toLayers(ordered)) {
    const batches = await Promise.all(
      layer.map(async (g) => {
        const options = g.generator.optionsSchema.parse(g.options);
        const files = await g.generator.generate({
          spec, options, outDir: g.outDir, logger: cfg.logger.child(g.generator.name),
        });
        return files.map((f) => ({ ...f, absPath: path.join(g.outDir, f.path) }));
      }),
    );
    results.files.push(...batches.flat());
  }

  assertNoPathCollisions(results.files);                   // two generators writing one file = error
  return cfg.dryRun ? results : writeAll(results.files, cfg);
}
```

### 5.4 Safe file writer: the "never destroy user work" feature (`writer/safe-write.ts`)

```ts
import { createHash } from 'node:crypto';

const header = (hash: string, ext: string) => {
  const line = `auto-generated by openapi-to-production. DO NOT EDIT. o2p-hash:${hash}`;
  return ext === '.cs' || ext === '.ts' || ext === '.tsx' ? `// ${line}\n` : `# ${line}\n`;
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export async function safeWrite(file: AbsGeneratedFile, opts: { force: boolean }): Promise<WriteOutcome> {
  const exists = await fs.pathExists(file.absPath);

  if (file.kind === 'scaffold') {
    return exists ? { status: 'skipped-scaffold' } : write(file, file.content, 'created');
  }

  const body = file.content;
  const hash = sha(body);
  const next = header(hash, path.extname(file.absPath)) + body;

  if (!exists) return write(file, next, 'created');

  const current = await fs.readFile(file.absPath, 'utf8');
  const m = /o2p-hash:([a-f0-9]{16})/.exec(current.split('\n', 1)[0]);
  if (!m) return opts.force ? write(file, next, 'overwritten') : { status: 'conflict', reason: 'no-header' };

  const currentBody = current.slice(current.indexOf('\n') + 1);
  const userEdited = sha(currentBody) !== m[1];          // body no longer matches its own hash
  if (userEdited && !opts.force) return { status: 'conflict', reason: 'user-modified' };
  if (current === next) return { status: 'unchanged' };

  return write(file, next, 'updated');
}
```

### 5.5 Config (`o2p.config.ts`) with full type-safety

```ts
import { defineConfig } from '@o2p/core';
import dotnet from '@o2p/gen-dotnet';
import tsClient from '@o2p/gen-ts-client';
import react from '@o2p/gen-react';

export default defineConfig({
  input: './openapi.yaml',
  generators: [
    dotnet({ out: './backend/src/Api', namespace: 'Acme.Api', framework: 'net9.0', validation: 'fluent', problemDetails: true }),
    tsClient({ out: './frontend/src/api', zod: true, baseUrlEnv: 'VITE_API_URL' }),
    react({ out: './frontend/src/api/hooks', queryLib: 'tanstack-v5', suspense: true }),
  ],
  lint: { requireOperationIds: true, requireExamples: 'warn' },
});
```

### 5.6 Naming + type mapping (the part that quietly decides quality)

```ts
// packages/gen-dotnet/src/type-map.ts
export function csType(s: Schema, required: boolean): string {
  const nullable = !required || (s.kind === 'primitive' && s.nullable);
  const q = nullable ? '?' : '';
  switch (s.kind) {
    case 'primitive':
      if (s.type === 'string') {
        if (s.format === 'date-time') return `DateTimeOffset${q}`;
        if (s.format === 'date') return `DateOnly${q}`;
        if (s.format === 'uuid') return `Guid${q}`;
        if (s.format === 'binary') return 'IFormFile';
        return `string${q}`;
      }
      if (s.type === 'integer') return `${s.format === 'int64' ? 'long' : 'int'}${q}`;
      if (s.type === 'number') return `${s.format === 'float' ? 'float' : 'double'}${q}`;
      return `bool${q}`;
    case 'array':  return `IReadOnlyList<${csType(s.items, true)}>${q}`;
    case 'ref':    return `${pascal(s.name)}${q}`;
    case 'enum':   throw new Error('Inline enums must be hoisted to named schemas by the IR builder');
    case 'union':  return 'object'; // polymorphism handled via [JsonDerivedType], see template
    case 'object': return s.additionalProperties ? `Dictionary<string, ${csType(s.additionalProperties, true)}>` : 'object';
  }
}
```

### 5.7 .NET templates (`gen-dotnet/src/templates/`)

**`controller-base.cs.hbs`** (generated, always overwritten)

```hbs
#nullable enable
using Microsoft.AspNetCore.Mvc;
using {{namespace}}.Models;
using {{namespace}}.Services;

namespace {{namespace}}.Controllers.Generated;

[ApiController]
[Route("{{basePath}}")]
public abstract class {{pascal tag}}ControllerBase : ControllerBase
{
    protected readonly I{{pascal tag}}Service Service;
    protected {{pascal tag}}ControllerBase(I{{pascal tag}}Service service) => Service = service;
{{#each operations}}

    /// <summary>{{summary}}</summary>
    {{#if deprecated}}[Obsolete]{{/if}}
    {{#each responses}}[ProducesResponseType({{#if schema}}typeof({{csType schema}}), {{/if}}StatusCodes.Status{{statusConst status}})]
    {{/each}}
    [Http{{pascal method}}("{{routeTemplate path}}")]
    {{#if authorize}}[Authorize]{{/if}}
    public virtual async Task<ActionResult<{{successType this}}>> {{pascal id}}(
        {{#each parameters}}[From{{pascal in}}(Name = "{{name}}")] {{csType schema required}} {{camel name}}{{#unless @last}},{{/unless}}
        {{/each}}{{#if requestBody}}, [FromBody] {{csType requestBody.schema true}} body{{/if}},
        CancellationToken ct = default)
        => await Service.{{pascal id}}Async({{argList this}}, ct);
{{/each}}
}
```

**`controller.cs.hbs`** (scaffold: written once, user owns it)

```hbs
namespace {{namespace}}.Controllers;

public sealed class {{pascal tag}}Controller(I{{pascal tag}}Service service)
    : Generated.{{pascal tag}}ControllerBase(service);
```

**`service-interface.cs.hbs`** (generated) and **`service.cs.hbs`** (scaffold, throws `NotImplementedException` with TODO per method).

**`validator.cs.hbs`** (generated FluentValidation, from schema constraints)

```hbs
public sealed class {{pascal name}}Validator : AbstractValidator<{{pascal name}}>
{
    public {{pascal name}}Validator()
    {
{{#each properties}}
        RuleFor(x => x.{{pascal name}})
            {{#if required}}.NotNull(){{/if}}
            {{#if schema.constraints.minLength}}.MinimumLength({{schema.constraints.minLength}}){{/if}}
            {{#if schema.constraints.maxLength}}.MaximumLength({{schema.constraints.maxLength}}){{/if}}
            {{#if schema.constraints.pattern}}.Matches(@"{{schema.constraints.pattern}}"){{/if}}
            {{#if schema.constraints.minimum}}.GreaterThanOrEqualTo({{schema.constraints.minimum}}){{/if}};
{{/each}}
    }
}
```

**DTO output (records, immutable):**

```csharp
public sealed record Pet(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("status")] PetStatus? Status);

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PetStatus { Available, Pending, Sold }
```

Also generate: `ProblemDetails` global handler, `AddGeneratedApi()` DI extension that auto-registers all validators + a `ValidationFilter`, Swagger UI wired to the original spec, and a `Program.cs` scaffold.

### 5.8 TypeScript client output (target quality)

```ts
// generated: ts-client/client.ts
export class ApiError extends Error {
  constructor(public status: number, public body: unknown, public problem?: ProblemDetails) {
    super(problem?.title ?? `HTTP ${status}`);
  }
}

export interface ClientOptions {
  baseUrl: string;
  getToken?: () => string | Promise<string | undefined>;
  fetch?: typeof fetch;
  retry?: { attempts: number; backoffMs: number };
}

export function createClient(opts: ClientOptions) {
  const f = opts.fetch ?? fetch;
  async function request<T>(method: string, path: string, init: RequestInit & { query?: Record<string, unknown>; schema?: z.ZodType<T> }): Promise<T> {
    const url = new URL(path, opts.baseUrl);
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const token = await opts.getToken?.();
    const res = await f(url, { ...init, method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...init.headers } });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => undefined));
    if (res.status === 204) return undefined as T;
    const json = await res.json();
    return init.schema ? init.schema.parse(json) : (json as T);   // runtime validation of responses
  }

  return {
    pets: {
      listPets: (q?: ListPetsQuery) => request<Pet[]>('GET', '/pets', { query: q, schema: z.array(PetSchema) }),
      getPet:   (petId: string)     => request<Pet>('GET', `/pets/${encodeURIComponent(petId)}`, { schema: PetSchema }),
      createPet:(body: CreatePet)   => request<Pet>('POST', '/pets', { body: JSON.stringify(CreatePetSchema.parse(body)), schema: PetSchema }),
    },
  };
}
export type ApiClient = ReturnType<typeof createClient>;
```

### 5.9 React hooks output

```ts
// generated: react-hooks/pets.ts
export const petKeys = {
  all: ['pets'] as const,
  list: (q?: ListPetsQuery) => [...petKeys.all, 'list', q] as const,
  detail: (id: string) => [...petKeys.all, 'detail', id] as const,
};

export const useListPets = (q?: ListPetsQuery, opts?: Omit<UseQueryOptions<Pet[], ApiError>, 'queryKey' | 'queryFn'>) => {
  const api = useApi();
  return useQuery({ queryKey: petKeys.list(q), queryFn: () => api.pets.listPets(q), ...opts });
};

export const useCreatePet = (opts?: UseMutationOptions<Pet, ApiError, CreatePet>) => {
  const api = useApi(); const qc = useQueryClient();
  return useMutation({
    mutationFn: api.pets.createPet,
    onSuccess: (...a) => { qc.invalidateQueries({ queryKey: petKeys.all }); opts?.onSuccess?.(...a); },
    ...opts,
  });
};
// Pagination detected via spec (page/limit or cursor) → also emit useInfiniteListPets
```

### 5.10 Mock server (core of `o2p mock`)

```ts
export async function startMock(spec: ApiSpec, { port = 4010, delayMs = 0, seed = 1 } = {}) {
  faker.seed(seed);
  const app = Fastify({ logger: true });
  const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);

  for (const op of spec.operations) {
    const validateBody = op.requestBody && ajv.compile(toJsonSchema(op.requestBody.schema, spec));
    app.route({
      method: op.method.toUpperCase() as HTTPMethods,
      url: op.path.replace(/{(\w+)}/g, ':$1'),
      handler: async (req, reply) => {
        if (delayMs) await sleep(delayMs);
        if (validateBody && !validateBody(req.body))
          return reply.code(400).send({ title: 'Validation failed', errors: validateBody.errors });
        const forced = req.headers['x-mock-status'];              // pick a response via header
        const res = pickResponse(op, forced ? String(forced) : undefined);
        return reply.code(Number(res.status)).send(res.schema ? fakeFromSchema(res.schema, spec) : undefined);
      },
    });
  }
  await app.listen({ port });
  return app;
}
```

`fakeFromSchema` prefers the spec's `example` → falls back to format-aware faker (`uuid`, `email`, `date-time`, constraints respected).

### 5.11 Generated contract tests (.NET), proving the server obeys the spec

```csharp
public class PetsContractTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _http = factory.CreateClient();
    private static readonly OpenApiSpec Spec = OpenApiSpec.Load("openapi.yaml");

    [Theory, MemberData(nameof(Operations))]
    public async Task Response_matches_declared_schema(OperationCase op)
    {
        var res = await _http.SendAsync(op.BuildRequest());
        res.StatusCode.Should().BeOneOf(op.DeclaredStatuses);              // status declared in spec
        if (res.Content.Headers.ContentLength > 0)
            Spec.Validate(op, (int)res.StatusCode, await res.Content.ReadAsStringAsync())
                .Should().BeEmpty("the body must satisfy the response schema");
    }

    [Fact] public async Task Invalid_body_returns_400_problem_details() { /* generated from required/min/max */ }
    [Fact] public async Task Protected_endpoint_without_token_returns_401() { /* from security */ }
}
```

TS side: `vitest` + `msw` handlers generated from the same IR, plus a test that `ApiClient` rejects on schema-mismatched responses.

### 5.12 Postman generator (essentials)

```ts
const item = (op: Operation) => ({
  name: op.summary ?? op.id,
  request: {
    method: op.method.toUpperCase(),
    url: { raw: `{{baseUrl}}${postmanPath(op.path)}`, host: ['{{baseUrl}}'], path: pathSegments(op.path), query: queryParams(op) },
    header: [{ key: 'Content-Type', value: 'application/json' }],
    auth: op.security.length ? { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] } : undefined,
    body: op.requestBody && { mode: 'raw', raw: JSON.stringify(exampleFor(op.requestBody.schema), null, 2) },
  },
  event: [{ listen: 'test', script: { exec: [
    `pm.test('status is declared', () => pm.expect(${JSON.stringify(op.responses.map(r => +r.status))}).to.include(pm.response.code));`,
  ]}}],
});
```

Folders per tag; ships `environment.json` with `baseUrl` and `token`.

---

## 6. CLI UX

```
$ o2p init
  ◆ Input spec?            ./openapi.yaml
  ◆ Targets?               ■ ASP.NET Core  ■ TS client  ■ React hooks  □ Next.js
  ◆ Output folders?        ...
  ✔ Wrote o2p.config.ts

$ o2p generate
  ✔ Loaded openapi.yaml (38 operations, 52 schemas)
  ✔ dotnet-api     41 files  (12 created, 27 updated, 2 unchanged)
  ✔ ts-client       9 files
  ✔ react-hooks     7 files
  ⚠ conflict: backend/.../PetsServiceBase.cs was edited by hand. Use --force to overwrite
  Done in 1.4s

$ o2p check          # exit 1 if generated output is stale vs spec
$ o2p diff old.yaml new.yaml   # BREAKING: removed GET /pets/{id}; field Pet.name now required
$ o2p mock --port 4010 --delay 200
```

Exit codes: `0` ok, `1` drift/conflicts, `2` invalid spec, `3` config error. Support `--json` output for CI tooling and `--dry-run`.

---

## 7. Edge cases the implementation must handle (this is what separates it from a toy)

- `allOf` (merge), `oneOf`/`anyOf` + `discriminator` (→ `[JsonPolymorphic]` / TS discriminated union)
- `nullable` (3.0) vs `type: [x, "null"]` (3.1)
- Recursive/circular `$ref`
- Inline anonymous schemas → hoist and auto-name (`CreatePetRequest`, `ListPetsResponse`)
- Enums (string/int), enum name collisions, reserved words (`class`, `object`, `default`)
- `multipart/form-data` and file uploads, `application/x-www-form-urlencoded`
- Path/query/header params, `style`/`explode` for arrays
- Pagination detection (`page`/`limit`, `cursor`/`next`)
- Security: bearer, apiKey, OAuth2 (scaffold only)
- Duplicate or missing `operationId` → deterministic fallback + lint warning
- Deterministic output ordering (stable diffs, no timestamps in generated files)
- Windows/Linux line-ending normalization

---

## 8. Testing strategy (the resume gold)

1. **Unit tests**: IR builder, naming, type maps (target ≥ 90% coverage on `core`).
2. **Golden/snapshot tests**: every generator against `examples/*`, snapshot committed.
3. **Property tests** (`fast-check`): random schemas → IR → no throw, deterministic.
4. **Compile tests (E2E)**: CI generates `examples/ecommerce`, then runs `dotnet build`, `dotnet test`, `tsc --noEmit`, `vitest`. *If generated code doesn't compile, CI fails.*
5. **Corpus test**: run against public specs (Stripe, GitHub, Petstore, Twilio) and assert no crash plus report compile rate.
6. **Round-trip test**: generate → mock server → generated client → assert responses validate.
7. **Drift test**: mutate spec, `o2p check` must exit 1.

---

## 9. CI/CD (`.github/workflows/ci.yml`)

```yaml
name: ci
on: [push, pull_request]
jobs:
  node:
    runs-on: ubuntu-latest
    steps:
      - actions/checkout@v4
      - pnpm/action-setup@v4
      - actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck test build
      - uses: codecov/codecov-action@v4
  e2e:
    needs: node
    runs-on: ubuntu-latest
    strategy: { matrix: { example: [petstore, ecommerce] } }
    steps:
      - actions/checkout@v4
      - pnpm/action-setup@v4
      - actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - actions/setup-dotnet@v4
        with: { dotnet-version: 9.0.x }
      - run: pnpm install --frozen-lockfile && pnpm build
      - run: pnpm o2p generate --config examples/${{ matrix.example }}/o2p.config.ts
      - run: dotnet build examples/${{ matrix.example }}/backend && dotnet test examples/${{ matrix.example }}/backend
      - run: pnpm --filter ./examples/${{ matrix.example }}/frontend exec tsc --noEmit
      - run: pnpm o2p check --config examples/${{ matrix.example }}/o2p.config.ts
```

Also ship a **reusable GitHub Action** (`uses: you/openapi-to-production@v1`) that runs `o2p check` on PRs and comments breaking changes via `o2p diff`.

---

## 10. Production-readiness checklist

- [ ] Strict TS, ESLint, Prettier, commit hooks (lefthook), Conventional Commits
- [ ] Changesets + automated npm publish with provenance
- [ ] Dependabot/Renovate + CodeQL + `pnpm audit` in CI
- [ ] Structured logging, `--verbose`/`--quiet`, helpful error messages with spec JSON pointers (`#/paths/~1pets/get/responses`)
- [ ] Performance: 1,000-operation spec generates < 5s (add a benchmark)
- [ ] Docs site (Docusaurus/VitePress) + animated terminal GIF in README
- [ ] Docker image `ghcr.io/you/o2p` (for the mock server and CI)
- [ ] `CONTRIBUTING.md` with "write a generator in 15 minutes" tutorial
- [ ] Badges: CI, coverage, npm version, license, "compile-verified output"
- [ ] Semantic versioning + `CHANGELOG.md`

---

## 11. `.cursor/rules/project.mdc` (paste this first)

```md
---
description: openapi-to-production conventions
alwaysApply: true
---
- TypeScript strict. No `any` (use `unknown` + narrowing). No default exports except config files.
- Generators are PURE functions: (ApiSpec, options) => GeneratedFile[]. Never read/write disk in a generator.
- Never read raw OpenAPI inside generators, only the IR from `@o2p/core`.
- Generated output must be deterministic: sort keys/operations, no timestamps, LF endings.
- Every new generator ships with: options zod schema, golden snapshot test, README section, example output.
- Every public function has TSDoc. Errors include a JSON pointer into the spec when relevant.
- Prefer small files (<200 lines). Add tests in the same PR as the code.
- Run `pnpm turbo run lint typecheck test` before declaring a task done.
- Do not add dependencies without justifying them in the PR description.
```

---

## 12. Phase-by-phase prompts for Cursor

Paste each prompt separately. Wait until it is green (`pnpm turbo run lint typecheck test`) before moving on.

**Phase 0: Scaffold**
> Read SPEC.md. Create the pnpm + Turborepo monorepo with the layout in Section 4 (empty packages with package.json, tsconfig extending tsconfig.base.json, vitest config). Add ESLint flat config, Prettier, lefthook with commit-msg conventional-commit check, Changesets, LICENSE (MIT), and `.cursor/rules/project.mdc` from Section 11. Add the CI workflow from Section 9 (node job only for now). Don't implement features yet.

**Phase 1: Loader + IR**
> Implement `packages/core`: loader (swagger-parser, bundle and validate, errors with JSON pointers), IR types exactly as in Section 5.1, and the IR builder that handles everything in Section 7 (allOf merge, oneOf/discriminator, nullable 3.0/3.1, circular refs, hoisting+naming inline schemas, enum hoisting, reserved words). Write unit tests with fixtures covering each case, plus `examples/petstore/openapi.yaml` and `examples/ecommerce/openapi.yaml` (auth, pagination, uploads, polymorphism).

**Phase 2: Plugin API, pipeline, safe writer**
> Implement Section 5.2, 5.3 and 5.4: `defineGenerator`, topological ordering with cycle detection, parallel layers, path-collision detection, and the safe writer with hash headers, scaffold-once, conflict detection, `--force`, `--dry-run`, and a unified-diff summary. Add `defineConfig` + config loading (jiti) with zod validation and friendly errors. Test all writer states (created/updated/unchanged/conflict/skipped-scaffold) using a memfs.

**Phase 3: CLI**
> Implement `packages/cli` with commands `init`, `generate`, `check`, `lint`, `diff` per Section 6 (commander + @clack/prompts). Implement exit codes, `--json`, `--watch` (chokidar), colored output. `check` = run pipeline in dry-run and fail if any generated file would change. `lint` rules: requireOperationIds, requireExamples, noDuplicateOperationIds, consistentNaming. `diff` = classify breaking vs non-breaking changes (removed path/op, new required param/field, type narrowing, removed enum value).

**Phase 4: .NET generator**
> Implement `packages/gen-dotnet` using Handlebars templates in Section 5.7 and the type map in 5.6. Output: records for DTOs, enums, abstract `XxxControllerBase`, scaffold `XxxController`, `IXxxService` (generated) + scaffold `XxxService`, FluentValidation validators, `AddGeneratedApi()` DI extension, ProblemDetails handler, Program.cs/csproj scaffold. Add golden snapshots and a CI job that builds the generated petstore + ecommerce projects with `dotnet build`.

**Phase 5: TS client + Zod**
> Implement `packages/gen-ts-client` per 5.8: typed types, Zod schemas, `createClient` with auth hook, retries, ApiError/ProblemDetails, runtime response validation, tree-shakable per-tag modules, multipart support. Tests with vitest and a local fake server. Output must pass `tsc --strict --noEmit`.

**Phase 6: React + Next.js**
> Implement `packages/gen-react` (5.9: query key factories, useQuery/useMutation, invalidation, infinite queries for detected pagination, `ApiProvider` + `useApi`) and `packages/gen-nextjs` (typed route handler proxies, server-action wrappers, RSC-safe client factory, optional `prefetch` helpers using `HydrationBoundary`). Compile-check the generated examples in CI.

**Phase 7: Tests, Postman, Docs**
> Implement `gen-tests` (5.11: xUnit contract tests via WebApplicationFactory + schema validation of responses, 400/401 tests derived from constraints and security; vitest + MSW handlers for TS), `gen-postman` (5.12, v2.1 collection + environment + test scripts), and `gen-docs` (markdown per tag + a static HTML page embedding Scalar). All deterministic, all snapshot-tested.

**Phase 8: Mock server**
> Implement `packages/mock-server` per 5.10: Fastify routes from IR, request validation with Ajv, example-first fake data with faker (seeded), `x-mock-status` header, `--delay`, CORS, `/__spec` endpoint, Dockerfile. Wire it as `o2p mock`. Add the round-trip E2E test (mock ↔ generated client).

**Phase 9: E2E, corpus, perf**
> Create `/e2e`: generate both examples, run dotnet build/test and tsc/vitest on outputs, run `o2p check`, mutate the spec and assert drift is detected. Add a corpus test against public specs (download in CI cache) reporting a compile-success rate. Add a benchmark generating a 1,000-operation synthetic spec; fail CI if > 5s.

**Phase 10: Polish and launch**
> Write README (hero GIF via vhs/asciinema, 30-second quickstart, feature table, architecture diagram as Mermaid, comparison table vs NSwag/openapi-generator, "write a plugin" section), VitePress docs site, ADRs from Section 3, CONTRIBUTING, SECURITY, issue/PR templates, the reusable GitHub Action, release workflow with provenance, and publish `0.1.0`.

---

## 13. README outline (what recruiters actually read)

1. Hero: one-liner + terminal GIF
2. **Why** (3 bullets: IR-first, safe regeneration, compile-verified output)
3. 30-second quickstart (`npx @o2p/cli init && npx o2p generate`)
4. What you get (tree of generated output)
5. Feature matrix (generators × options)
6. Architecture diagram (Mermaid)
7. Safe regeneration explained (generated vs scaffold)
8. CI integration (`o2p check`, GitHub Action)
9. Plugin authoring (15-line example)
10. Benchmarks and test strategy (coverage, corpus compile rate)
11. Roadmap, contributing, license

---

## 14. Resume bullets (adapt with real numbers once built)

- Designed and built **openapi-to-production**, a TypeScript monorepo CLI that turns an OpenAPI spec into an ASP.NET Core API, typed TS client, React Query hooks, validation, contract tests, Postman collection, docs and a mock server.
- Architected a language-neutral **intermediate representation** and a pure-function **plugin system**, cutting per-target generator code by ~X% and enabling third-party generators.
- Engineered a **hash-based safe-regeneration writer** (generated vs scaffold files, conflict detection) so spec changes never overwrite hand-written business logic.
- Built **drift detection and breaking-change analysis** (`o2p check` / `o2p diff`) integrated as a GitHub Action for PR gating.
- Achieved **N% coverage** and a CI matrix that compiles and tests generated output (`dotnet test`, `tsc`, `vitest`) against Y public API specs with Z% compile success.

---

## 15. Stretch goals (v0.2+)

- Python (FastAPI + Pydantic) and Go generators proving IR portability
- SDK generation for Swift/Kotlin
- VS Code extension (live preview of generated output)
- Spec-first **AI assist**: `o2p suggest` proposes missing examples and descriptions
- Web playground (WASM/StackBlitz) to paste a spec and browse generated files
- OpenAPI 3.1 webhooks + callbacks, AsyncAPI input
- Telemetry-free usage analytics via opt-in anonymous generator counts

---

## 16. Definition of done for v1.0

- All 10 phases merged, CI green on Linux (and Windows for CLI tests)
- `ecommerce` example: generated .NET API builds, runs, and passes its generated contract tests; generated React app talks to it; mock server mirrors it
- ≥ 90% coverage on `core`, snapshots for every generator, drift test passing
- Published to npm with provenance, docs site live, Docker image on GHCR
