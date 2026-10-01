# ADR-002: Generated vs. Scaffold Files

## Status
Accepted

## Context
Code generators frequently overwrite user-written logic when specifications change, forcing developers to resort to git stashing, manual merging, or abandoning regeneration altogether.

## Decision
Every file emitted by a generator has an explicit `kind`:
1. `generated`: Always overwritten. Includes a SHA-256 header hash `o2p-hash:<hash>`. If the user edits the body, `o2p` flags a conflict rather than clobbering work.
2. `scaffold`: Written once upon initial generation (e.g., concrete Controller classes, service implementations, `Program.cs`). Never overwritten on subsequent runs.
