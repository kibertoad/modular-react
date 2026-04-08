# @react-router-modules/testing

Testing utilities for reactive modules. Render modules in isolation with mocked dependencies.

## Installation

```bash
npm install -D @react-router-modules/testing
```

## Usage

```typescript
import { renderModule, createMockStore } from "@react-router-modules/testing";

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

See the [main documentation](https://github.com/kibertoad/reactive#readme) for the full guide.
