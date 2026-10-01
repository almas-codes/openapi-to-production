# ADR-004: Pure Functional Generators

## Status
Accepted

## Context
Generators that perform side effects (disk writes, network calls, filesystem queries) are difficult to test, prone to race conditions when run in parallel, and cannot easily support dry-run or diffing modes.

## Decision
All generators in `o2p` are pure functions:
`(spec: ApiSpec, options: TOpts) => Promise<GeneratedFile[]>`

All filesystem I/O, conflict checking, diff generation, and hash calculations are centralized in `SafeWriter`.

## Consequences
- Snapshot / golden testing of generators is trivial and fast.
- Parallel layer execution in the pipeline has zero disk contention.
- `o2p check` and `o2p --dry-run` run cleanly without mock filesystems.
