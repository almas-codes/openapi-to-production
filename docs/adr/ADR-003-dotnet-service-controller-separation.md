# ADR-003: .NET Controller & Service Separation

## Status
Accepted

## Context
When generating backend ASP.NET Core endpoints, putting business logic in controller actions makes continuous regeneration impossible without destroying implementation code.

## Decision
For ASP.NET Core:
1. `AbstractControllerBase` is generated and overwritten on each run, handling route attributes, HTTP verbs, parameter binding, and delegating to an injected `IXxxService`.
2. `IXxxService` interface is generated and overwritten on each run.
3. Concrete `XxxController` inherits from `AbstractControllerBase` as a scaffold (written once).
4. Concrete `XxxService` implements `IXxxService` as a scaffold (written once, containing initial `NotImplementedException` stubs).

## Consequences
Business logic lives entirely in services. Whenever the OpenAPI spec adds endpoints, parameters, or models, the controller base and interface update automatically, creating compile-time safety without touching existing service implementations.
