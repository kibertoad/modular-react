# @modular-react/testing

Router-agnostic testing utilities for modules. Resolve module contributions (slots, lifecycle) without rendering.

## Installation

```bash
npm install -D @modular-react/testing
```

## Usage

```typescript
import { resolveModule, createMockStore } from "@modular-react/testing";

const { slots, entry, onRegisterCalled } = resolveModule(myModule, {
  defaults: { commands: [], badges: [] },
  deps: { auth: { user: { isAdmin: true } } },
});

expect(slots.commands).toHaveLength(2);
expect(entry.id).toBe("my-module");
```

For rendering modules with a router, use the router-specific testing packages (`@react-router-modules/testing` or `@tanstack-react-modules/testing`).

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
