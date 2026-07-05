# @modular-react/core

React binding facade over [`@modular-frontend/core`](../frontend-core). It re-exports the full framework-neutral surface (module descriptor types, slot/navigation builders, validation, journey contracts, and a lightweight store) so React apps and the `@react-router-modules/*` / `@tanstack-react-modules/*` packages import everything from `@modular-react/core` unchanged.

The framework-neutral logic and types live in `@modular-frontend/core`. This package exists so React consumers keep a stable import path and so React-specific refinements (e.g. narrowing the `UiComponent` seam to `React.ComponentType`) have a home without moving shared logic back.

## Installation

```bash
npm install @modular-react/core
```

## Usage

```typescript
import { buildSlotsManifest, createStore } from "@modular-react/core";
import type { ModuleDescriptor, Store } from "@modular-react/core";
```

Everything exported from `@modular-frontend/core` is available here. See its [README](../frontend-core/README.md) for the primitives, the `UiComponent` / `UiNode` seam, `NavigationItem` generics, `AnyModuleDescriptor`, and `mergeRouteStaticData`.

## Full documentation

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
