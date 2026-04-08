# @tanstack-react-modules/testing

Testing utilities for modules. Render modules in isolation with mocked dependencies.

## Installation

```bash
npm install -D @tanstack-react-modules/testing
```

## Usage

```typescript
import { renderModule, createMockStore } from "@tanstack-react-modules/testing";

const result = await renderModule(billingModule, {
  route: "/billing",
  deps: {
    auth: createMockStore<AuthStore>({ isAuthenticated: true }),
    httpClient: { get: vi.fn() },
  },
});

expect(result.getByText("Billing Dashboard")).toBeTruthy();
```

Both `renderModule` and `resolveModule` automatically evaluate `dynamicSlots` when present on a module, using the provided `deps` to build the dependencies snapshot.

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
