# @modular-frontend/compositions-engine

The framework-neutral engine behind [Compositions](https://github.com/kibertoad/modular-react#readme): arrange several modules (and journeys) into named **zones** on a single screen, driven by a per-instance scoped store. It owns the composition runtime, scoped stores, validation, authoring helpers, and the type surface, with no UI-framework dependency.

This is the shared foundation the framework bindings build on. The React binding (`@modular-react/compositions`) re-exports this package and adds the UI layer (outlet, provider, hooks); a future `@modular-vue/compositions` will do the same over the same engine.

## Installation

```bash
npm install @modular-frontend/compositions-engine
```

Most apps depend on a binding (`@modular-react/compositions`) rather than on this package directly. Use `@modular-frontend/compositions-engine` when building a new framework binding or framework-agnostic tooling over compositions.

## What's included

- **Runtime**: `createCompositionRuntime`, `getInternals` (low-level accessor the outlet drives), `hydrateComposition`, `CompositionRuntimeOptions`, and the `CompositionHydrationError` / `UnknownCompositionError` classes.
- **Validation**: `validateCompositionContracts`, `validateCompositionDefinition`, and the `CompositionValidationError` class.
- **Scoped stores**: `createCompositionZoneStores`, `noopCompositionZoneStores`, and the `CompositionZoneStores` type.
- **Authoring helpers**: `defineComposition`, `defineCompositionHandle`.
- **Types**: the full composition type surface (`CompositionDefinition`, `CompositionInstance`, `CompositionRuntime`, `CompositionZoneMap`, zone selectors, and the rest).

## Full documentation

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
