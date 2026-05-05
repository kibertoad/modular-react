---
name: journey-authoring
description: Use when defining, wiring, testing, or debugging @modular-react/journeys: module entry/exit contracts, defineJourney transitions, JourneyOutlet, persistence, back behavior, child journey invocation, or transition typing.
sources:
  - ../../README.md
  - ../../../../docs/workspace-patterns.md
  - ../../../../docs/shell-patterns.md
---

# Journey authoring

Use `@modular-react/journeys` when a domain flow spans several modules and needs typed transitions plus serializable shared state. Keep modules journey-unaware.

## Roles

- Module: owns entry components, input types, exit names, and exit payloads.
- Journey: owns start input, shared state, transitions, branching, completion, and aborts.
- Shell: registers modules and journeys, then mounts a `JourneyOutlet` in a route, tab, modal, or panel.

## Author module contracts first

Define exits once and reuse the type in entry components:

```ts
import { defineExit } from "@modular-react/core";

export const profileExits = {
  profileComplete: defineExit<{ customerId: string }>(),
  cancelled: defineExit(),
} as const;
```

Declare entry points on the module:

```ts
import { defineEntry, defineModule, schema } from "@modular-react/core";

export default defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: profileExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewProfile,
      input: schema<{ customerId: string }>(),
    }),
  },
});
```

## Define transitions centrally

Reference module ids, entry names, and exit names directly. Return exactly one outcome from each transition branch: next module entry, complete, or abort.

```ts
export const customerOnboarding = defineJourney({
  id: "customer-onboarding",
  version: "1.0.0",
  start: ({ customerId }) => ({
    module: "profile",
    entry: "review",
    input: { customerId },
  }),
  transitions: {
    profile: {
      review: {
        profileComplete: ({ output }) => ({
          next: {
            module: "plan",
            entry: "select",
            input: { customerId: output.customerId },
          },
        }),
        cancelled: () => ({ abort: "cancelled" }),
      },
    },
  },
});
```

## Persistence

Use persistence when a reload, hand-off, or long-running workflow must survive the current tab session. Choose stable keys, version incompatible saved state, and test hydrate and start paths separately.

## Testing

- Test module entries with typed `ModuleEntryProps` and mocked exits.
- Test pure transition behavior with the simulator before rendering.
- Add integration coverage around persistence, back navigation, child journey invocation, and terminal states when used.

## Common mistakes

- Do not make modules import or call a specific journey.
- Do not store journey state in the shell or a module store when it belongs to the journey.
- Do not leave scaffolded `TODO` transitions in generated journey packages.
- Do not return helper-call transition objects when catalog static analysis needs to recover destinations; prefer direct literal returns for common branches.
- Do not treat `allowBack` as automatic persistence. Back history and saved state are separate concerns.
