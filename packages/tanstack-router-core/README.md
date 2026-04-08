# @tanstack-react-modules/core

Core types and utilities for defining reactive modules. This is the package modules import - it provides `defineModule`, typed hooks (`useStore`, `useService`), scoped stores, and all shared type definitions.

## Installation

```bash
npm install @tanstack-react-modules/core
```

## Usage

```typescript
import { defineModule } from "@tanstack-react-modules/core";

export default defineModule<AppDependencies, AppSlots>({
  id: "billing",
  version: "0.1.0",
  createRoutes: (parentRoute) => {
    /* ... */
  },
  navigation: [{ label: "Billing", to: "/billing", group: "finance" }],
  slots: { commands: [{ id: "billing:export", label: "Export", onSelect: () => {} }] },
});
```

See the [main documentation](https://github.com/kibertoad/reactive#readme) for the full guide.
