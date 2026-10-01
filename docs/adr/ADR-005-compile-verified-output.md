# ADR-005: Compile-Verified Output in CI

## Status
Accepted

## Context
Code generators often emit syntactically invalid code, incorrect imports, or type errors for complex OpenAPI specs (edge-case polymorphism, nullable unions, recursive models) which only fail at runtime for end users.

## Decision
Every release and CI build executes end-to-end compilation checks on realistic benchmark specs (`examples/petstore`, `examples/ecommerce`). This invokes:
1. `dotnet build` & `dotnet test` on the generated C# backend
2. `tsc --noEmit` on the generated TypeScript client and React Query hooks
3. `vitest` on contract tests

If generated output does not compile, CI fails immediately.
