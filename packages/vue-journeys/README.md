# @modular-vue/journeys

Vue 3 journeys for `@modular-vue`. Journeys are typed, serializable workflows
that compose multiple modules: a journey declares entry/exit transitions between
modules and owns shared state, while the modules stay journey-unaware.

This package is the Vue binding over the framework-neutral
[`@modular-frontend/journeys-engine`](../journeys-engine). It re-exports the
engine's authoring surface (`defineJourney`, handles, persistence, transition
helpers) and adds the Vue-specific pieces: the provider, the instance
composables, and the registry plugin.

The journey outlet (mount-kind rendering, branch/rewind/resume), `<ModuleTab>`,
and `useWaitForExit` land in a following release; this package currently ships
the provider, the instance composables, and the plugin.

## Installation

```bash
npm install @modular-vue/journeys
```

## What's included

- **`<JourneyProvider :runtime="…">`** — provides the journey runtime to
  descendant journey hosts and mounts `<ModuleExitProvider>` so module exits
  fired outside a step reach the shell's `onModuleExit`.
- **`useJourneyState(id)` / `useJourneyInstance(id)`** — subscribe to one
  journey instance; return a reactive ref of its `state` (or full snapshot).
- **`useActiveLeafJourneyState(rootId)` / `useActiveLeafJourneyInstance(rootId)`**
  — walk the `activeChildId` chain and track the deepest active leaf, so a
  parent host reads the child sub-flow's state without knowing the depth.
- **`journeysPlugin(options?)`** — pass to `createRegistry({ plugins: [...] })`
  to contribute `registerJourney(...)`, validate journey contracts against
  registered modules, produce the `JourneyRuntime` on
  `manifest.extensions.journeys`, and wrap the provider stack in
  `<JourneyProvider>`.

## Usage

```ts
// app-shared: register the plugin and journeys
import { createRegistry } from "@modular-vue/runtime";
import { journeysPlugin, defineJourney } from "@modular-vue/journeys";

const registry = createRegistry<AppDeps, AppSlots>({ stores, services, slots });
const journeys = journeysPlugin();
registry.use(journeys);

registry.registerJourney(checkoutJourney, {
  nav: { label: "Checkout", group: "flows" },
});
```

```vue
<!-- a host component reading the active leaf's state -->
<script setup lang="ts">
import { useActiveLeafJourneyInstance } from "@modular-vue/journeys";

const props = defineProps<{ rootId: string }>();
const leaf = useActiveLeafJourneyInstance(props.rootId);
</script>

<template>
  <span>{{ leaf?.step?.moduleId }} — {{ leaf?.status }}</span>
</template>
```

## Reactivity

The composables mirror the React hooks but return Vue refs. A single-instance
composable subscribes at setup and pushes fresh snapshots into a `shallowRef` on
every runtime change; the leaf-walking composables re-subscribe as the active
chain grows (a parent invokes a child) or shrinks (a child terminates and the
parent resumes). Read `.value` at the call site, or bind directly in templates.
