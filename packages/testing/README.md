# @modular-react/testing

Router-agnostic testing utilities for modular-react modules. Resolve module contributions (slots, lifecycle) without rendering.

## Installation

```bash
npm install -D @modular-react/testing
```

## What's included

- **`resolveModule`**: resolves module contributions (slots, lifecycle) without rendering
- **`createMockStore`**: creates a store pre-populated with test state (uses `@modular-react/core`'s built-in store)
- **`preloadEntries`** / **`preloadEntry`**: eager-resolution mode for `lazy:` entries — render synchronously under vitest/jest with no Suspense fallback flash
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

## Eager-resolution mode for `lazy:` entries

`lazy:` entries normally resolve through `React.lazy` and require an enclosing
`<Suspense>` plus `await waitFor(...)` / `act` choreography to settle. In tests
this is mostly noise — you already know the chunk is local. `preloadEntries`
walks every `lazy:` entry on the given modules, runs each importer once, and
primes the resolver's per-entry cache. Subsequent renders commit the resolved
component synchronously on the first pass; the host's `<Suspense>` boundary
stays in place but its fallback never mounts.

```typescript
// vitest.setup.ts (or per-file beforeAll)
import { preloadEntries } from "@modular-react/testing";
import { allModules } from "../src/modules";

beforeAll(() => preloadEntries(allModules));
```

Tests then render hosts (`ModuleTab`, `JourneyOutlet`) with no extra ceremony:

```tsx
import { render } from "@testing-library/react";
import { ModuleTab } from "@modular-react/journeys";

it("renders the lazy review step", () => {
  const { getByTestId } = render(
    <ModuleTab module={reviewModule} entry="review" input={{ customerId: "C-1" }} />,
  );
  // No waitFor, no act, no fallback flash.
  expect(getByTestId("cid").textContent).toBe("C-1");
});
```

For modules built ad-hoc inside a single test (or any case where enumerating
modules upfront is awkward), call `preloadEntry` directly on the entry:

```typescript
import { preloadEntry } from "@modular-react/testing";

const entry = defineEntry({ lazy: () => import("./Review"), input: schema<...>() });
await preloadEntry(entry);
```

`preloadEntries` is idempotent — repeated calls reuse the resolver's cache, so
importers run at most once across the test run. Eager (`component:`) entries
are skipped, as are modules without an `entryPoints` map. `vi.mock(...)` of the
imported chunk works as expected: vitest hoists the mock before
`preloadEntries` runs, so the mocked component is what gets cached.

For rendering modules with a router, use the router-specific testing packages (`@react-router-modules/testing` or `@tanstack-react-modules/testing`).

See the [main documentation](https://github.com/kibertoad/modular-react#readme) for the full guide.
