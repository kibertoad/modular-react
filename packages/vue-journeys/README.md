# @modular-vue/journeys

Vue 3 journeys for `@modular-vue`. Journeys are typed, serializable workflows
that compose multiple modules: a journey declares entry/exit transitions between
modules and owns shared state, while the modules stay journey-unaware.

This package is the Vue binding over the framework-neutral
[`@modular-frontend/journeys-engine`](../journeys-engine). It re-exports the
engine's authoring surface (`defineJourney`, handles, persistence, transition
helpers) and adds the Vue-specific pieces: the provider, the composables, the
outlet, and the registry plugin.

The React binding is [`@modular-react/journeys`](../journeys); the two are kept
at parity, and its README carries the long-form guides (authoring patterns,
invoke/resume, persistence) that apply to both.

## Installation

```bash
npm install @modular-vue/journeys
```

## What's included

- **`<JourneyProvider :runtime="…">`** — provides the journey runtime to
  descendant journey hosts and mounts `<ModuleExitProvider>` so module exits
  fired outside a step reach the shell's `onModuleExit`.
- **`<JourneyOutlet :instance-id="…">`** — renders the current step of a running
  instance: mount-kind checks, loading, error boundary + policy, terminal, idle
  preload, and abandon-on-unmount. Walks the active call chain to the leaf by
  default.
- **`<JourneyHost :handle="…" :input="…">`** — mounts a journey in one line:
  starts it on mount, renders its step, ends + forgets the instance on unmount.
  Outlet props pass through as attrs, in either spelling (`:on-finished` and
  `:onFinished` both reach the outlet); the default scoped slot receives
  `{ instanceId, instance, runtime, stepIndex, outlet }` for chrome. `outlet` is
  a functional component — render it with `<component :is="outlet" />`, or spell
  it yourself as `<JourneyOutlet :instance-id="instanceId" :runtime="runtime" />`.
- **`useJourneyHost(handle, input, options?)`** — the lifecycle without the
  rendering. Returns `{ instanceId, instance, stepIndex }` as refs, plus the
  plain `runtime` it resolved at setup — the one `instanceId` is valid on.
- **`useJourneySync(id, port, options?)`** — keeps a journey and the URL in step
  both ways: the journey advances and the URL follows; Back/Forward drive
  `rewindTo` / `goForward`. You supply a small `JourneySyncPort` for vue-router.
- **`useJourneyState(id)` / `useJourneyInstance(id)`** — subscribe to one
  journey instance; return a reactive ref of its `state` (or full snapshot).
- **`useActiveLeafJourneyState(rootId)` / `useActiveLeafJourneyInstance(rootId)`**
  — walk the `activeChildId` chain and track the deepest active leaf, so a
  parent host reads the child sub-flow's state without knowing the depth.
- **`<ModuleTab>`** — renders a single module entry outside a route and forwards
  its exits to the shell. The non-journey counterpart to the outlet.
- **`useWaitForExit(exit, channels)`** — for step components that wait on an
  async backend event: races a push `subscribe` channel, a `poll` channel, and a
  `timeout` arm with first-wins-latched dispatch.
- **`journeysPlugin(options?)`** — pass to `createRegistry({ plugins: [...] })`
  to contribute `registerJourney(...)`, validate journey contracts against
  registered modules, produce the `JourneyRuntime` on
  `manifest.extensions.journeys`, and wrap the provider stack in
  `<JourneyProvider>`. In the router-owning install path it also threads the
  runtime app-wide via its `appProvides` hook, so `app.use(manifest)` provides
  `journeyKey` with no shell wiring.
- **`createPiniaJourneyPersistence(options)`** — a `JourneyPersistence` backed
  by a Pinia store you own (keyed like `createWebStoragePersistence`), so
  in-flight journeys live in your Pinia tree and resume across a modal
  close/reopen. Structural store shape — takes no `pinia` dependency.
- **`provideJourneyRuntime(app, runtime, options?)`** — the app-level twin of
  `<JourneyProvider>` (analog of `provideNavigation` / `provideSlots`), for
  wiring a hand-built runtime without the plugin. Usually unnecessary — the
  plugin auto-threads via `app.use(manifest)`.

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

```vue
<!-- a journey route: mounted, deep-linked, cleaned up -->
<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { JourneyOutlet, useJourneyHost, useJourneySync } from "@modular-vue/journeys";
import type { JourneySyncPort } from "@modular-vue/journeys";
import { checkoutHandle } from "@app/journeys-checkout";

const props = defineProps<{ cartId: string }>();
const router = useRouter();
const route = useRoute();

const { instanceId, stepIndex } = useJourneyHost(checkoutHandle, { cartId: props.cartId });

const port: JourneySyncPort = {
  read: () => String(route.params.step ?? ""),
  push: (path) => void router.push({ name: "checkout", params: { step: path } }),
  replace: (path) => void router.replace({ name: "checkout", params: { step: path } }),
  go: (delta) => router.go(delta),
  subscribe: (listener) => router.afterEach(() => listener()),
};

useJourneySync(instanceId, port, { stepToPath: (step) => step.entry });
</script>

<template>
  <p>Step {{ stepIndex + 1 }}</p>
  <JourneyOutlet v-if="instanceId" :instance-id="instanceId" />
</template>
```

`useJourneyHost` starts the journey on mount and ends + forgets it on unmount;
`useJourneySync` owns the URL. Neither knows about the other, and `instanceId`
is `null` for the first render (the journey is started from `onMounted`, so the
start is guaranteed to be paired with an unmount that ends it).

A URL cannot navigate a journey to an arbitrary step — a step is derived from
state, so the only positions a location can select are ones the journey has
already been to. See
[Deep-linking steps](../journeys/README.md#deep-linking-steps---usejourneysync)
in the React README for the full model; the reconciler is the same code.

## Reactivity

The composables mirror the React hooks but return Vue refs. A single-instance
composable subscribes at setup and pushes fresh snapshots into a `shallowRef` on
every runtime change; the leaf-walking composables re-subscribe as the active
chain grows (a parent invokes a child) or shrinks (a child terminates and the
parent resumes). Read `.value` at the call site, or bind directly in templates.
