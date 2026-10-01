# ADR-001: IR-First Architecture

## Status
Accepted

## Context
Traditional OpenAPI tools like NSwag and openapi-generator couple code generation directly to the OpenAPI 3.x AST / document structure. Every generator re-implements reference resolution, schema naming, allOf merging, and type mapping independently.

## Decision
All generators in `o2p` consume a unified, language-agnostic Intermediate Representation (`ApiSpec`). Raw OpenAPI specifications are parsed and normalized once by `@o2p/core` into this IR before dispatching to generators.

## Consequences
- Generators never deal with `$ref`, circular schemas, or raw vendor extensions directly.
- Adding a new generator (e.g., Go, Python, Swift) takes hours instead of weeks.
- Unified validation and quality linting occur at the IR boundary.
