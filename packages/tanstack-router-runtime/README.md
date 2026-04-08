# @tanstack-react-modules/runtime

Application assembly layer for the reactive framework. Takes modules and configuration, produces a running app with routing, slots, zones, navigation, and provider wiring.

## Installation

```bash
npm install @tanstack-react-modules/runtime
```

## Usage

```typescript
import { createRegistry } from "@tanstack-react-modules/runtime";
import billingModule from "./modules/billing";

const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore },
  services: { httpClient },
  slots: { commands: [] },
});

registry.register(billingModule);

const { App } = registry.resolve({
  rootComponent: Layout,
  indexComponent: HomePage,
});
```

See the [main documentation](https://github.com/kibertoad/reactive#readme) for the full guide.
