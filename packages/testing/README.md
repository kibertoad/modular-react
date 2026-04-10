# @modular-react/testing 

Router-agnostic testing utilities for modular-react modules. Resolve module contributions (slots, lifecycle) without rendering.

## Installation

```bash
npm install -D @modular-react/testing
```

## What's included

- **`resolveModule`**: resolves module contributions (slots, lifecycle) without rendering
- **`createMockStore`**: creates a store pre-populated with test state (uses `@modular-react/core`'s built-in store)
- **Types**: `ResolveModuleOptions`, `ResolveModuleResult`

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
