# @react-router-modules/runtime

Application assembly layer for the modular-react framework (React Router integration). Takes modules and configuration, produces a running app with routing, slots, zones, navigation, and provider wiring.

## Installation

```bash
npm install @react-router-modules/runtime
```

## Usage

```typescript
import { createRegistry } from "@react-router-modules/runtime";
import billingModule from "./modules/billing";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
  slots: { commands: [] },
});

registry.register(billingModule);

const { App, recalculateSlots } = registry.resolve({
  rootComponent: Layout,
  indexComponent: HomePage,
});

// Re-evaluate dynamic slots after auth state changes
authStore.subscribe((state, prev) => {
  if (state.isAuthenticated !== prev.isAuthenticated) {
    recalculateSlots();
  }
});
```

Modules can contribute conditional slot entries via `dynamicSlots` and trigger re-evaluation from components via `useRecalculateSlots()`. The shell can apply cross-cutting filters via `slotFilter` on `resolve()`.

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
