# @modular-frontend/journeys-engine

The framework-neutral engine behind [Journeys](https://github.com/kibertoad/modular-react#readme): typed, serializable workflows that compose several modules. It owns the journey runtime, validation, persistence, authoring helpers, handles, and the type surface, with no UI-framework dependency.

This is the shared foundation the framework bindings build on. The React binding (`@modular-react/journeys`) re-exports this package and adds the UI layer (outlet, provider, hooks); a future `@modular-vue/journeys` will do the same over the same engine.

## Installation

```bash
npm install @modular-frontend/journeys-engine
```

Most apps depend on a binding (`@modular-react/journeys`) rather than on this package directly. Use `@modular-frontend/journeys-engine` when building a new framework binding or framework-agnostic tooling over journeys.

## What's included

- **Runtime**: `createJourneyRuntime`, `getInternals` (low-level accessor the outlet and test harness drive), `JourneyRuntimeOptions`.
- **Validation**: `validateJourneyContracts`, `validateJourneyDefinition`, `validateJourneyGraph`, and the `JourneyValidationError` / `JourneyHydrationError` / `UnknownJourneyError` classes.
- **Persistence**: `defineJourneyPersistence`, `createWebStoragePersistence`, `createMemoryPersistence`.
- **Authoring helpers**: `defineJourney`, `defineTransition`, `isAnnotatedTransition`, `isTerminalSentinel`, `selectModule`, `selectModuleOrDefault`.
- **Handles**: `defineJourneyHandle`, `invoke`.
- **Types**: the full journey type surface (`JourneyDefinition`, `JourneyInstance`, `JourneyStep`, `TransitionMap`, wildcard maps, and the rest).

### `@modular-frontend/journeys-engine/testing`

Framework-neutral test helpers: `createTestHarness` (drive a live runtime from a test without mounting an outlet) and `simulateJourney` (pure-logic transition simulation).

## Full documentation

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
