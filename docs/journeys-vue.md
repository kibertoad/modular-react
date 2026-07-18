# Journeys in Vue (`@modular-vue/journeys`)

A **journey** is a typed, multi-step flow — a wizard — with back/rewind,
persistence, and optional URL sync. The runtime is framework-neutral
(`@modular-frontend/journeys-engine`); `@modular-vue/journeys` is the Vue
binding, the faithful analog of `@modular-react/journeys`. Same names, same
semantics; the differences are Vue idiom (composables return `Ref` /
`ComputedRef`, components are `defineComponent`, render-prop children become
scoped slots).

Reach for a journey when a flow has typed steps, back/rewind, "resume where I
left off", or step↔URL sync — the shape that otherwise turns into a hand-rolled
`STEP_ORDER` + a bespoke store + a `resetFlowState()` you must remember to call.

> **Hosting is host-agnostic.** A journey runs in a route element, a tab, a
> modal, or a plain `<div>` — it never owns the URL unless you opt in. The
> primary case in this guide is a **modal with no router involvement**.

---

## Install

```bash
pnpm add @modular-vue/journeys @modular-frontend/journeys-engine
```

`@modular-vue/journeys` re-exports the entire engine surface, so you import
authoring helpers and types from the binding and never reach past it:

```ts
import {
  defineJourney,
  defineJourneyHandle,
  journeysPlugin,
  createWebStoragePersistence,
  type JourneyRuntime,
} from "@modular-vue/journeys";
```

---

## 1. Author a journey

```ts
// journeys/env-setup.ts
import { defineJourney, defineJourneyHandle } from "@modular-vue/journeys";

interface EnvSetupInput {
  frameId: string;
}
interface EnvSetupState {
  frameId: string;
  picked?: string;
  preflightOk?: boolean;
}

export const envSetup = defineJourney<Modules, EnvSetupInput>()({
  id: "env-setup",
  version: "1.0.0",
  initialState: ({ frameId }) => ({ frameId }),
  start: (s) => ({ module: "pick", entry: "pick", input: { frameId: s.frameId } }),
  transitions: {
    pick: {
      pick: { chosen: (s, out) => ({ next: { module: "review", entry: "review", input: out } }) },
    },
    review: {
      review: { confirmed: () => ({ next: { module: "preflight", entry: "run", input: {} } }) },
    },
    preflight: { run: { ok: () => ({ next: { module: "save", entry: "save", input: {} } }) } },
    save: { save: { done: () => ({ complete: { saved: true } }) } },
  },
});

// A handle lets modules/shells open the journey with typed `input` without
// importing the runtime.
export const envSetupHandle = defineJourneyHandle<"env-setup", EnvSetupInput, { saved: boolean }>(
  "env-setup",
);
```

Register it through the plugin when you build the registry:

```ts
import { createRegistry } from "@modular-vue/runtime";
import { journeysPlugin } from "@modular-vue/journeys";

export const registry = createRegistry({})
  .use(journeysPlugin())
  .register(pickModule)
  .register(reviewModule)
  .register(preflightModule)
  .register(saveModule);

registry.registerJourney(envSetup);
```

The plugin produces a `JourneyRuntime` on `manifest.extensions.journeys`, also
surfaced as the `manifest.journeys` convenience alias.

---

## 2. Host it

Three components + a set of composables, all Vue-idiomatic:

| Piece                                                        | Role                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `<JourneyProvider :runtime>`                                 | Provide the runtime to descendant outlets. Usually `manifest.journeys`.                                      |
| `<JourneyHost :handle :input>`                               | One-line host: start on mount, render the step, abandon on unmount.                                          |
| `<JourneyOutlet :instanceId>`                                | Render the current step of an existing instance.                                                             |
| `useJourneyHost(handle, input)`                              | Own an instance for a component's lifetime; returns reactive `{ instanceId, instance, runtime, stepIndex }`. |
| `useJourneyInstance` / `useJourneyState`                     | Tearing-free subscription to an instance snapshot / its state.                                               |
| `useActiveLeafJourneyInstance` / `useActiveLeafJourneyState` | The same, following the active call chain to the leaf.                                                       |
| `useJourneySync`                                             | Opt-in journey↔URL reconciliation (see §6).                                                                  |
| `useWaitForExit`                                             | Race async channels and dispatch a journey exit.                                                             |

The one-line host with chrome via the scoped slot:

```vue
<script setup lang="ts">
import { JourneyHost } from "@modular-vue/journeys";
import { envSetupHandle } from "~/journeys/env-setup";
</script>

<template>
  <JourneyHost :handle="envSetupHandle" :input="{ frameId }" @finished="onFinished">
    <template #default="{ stepIndex, outlet }">
      <WizardChrome title="Environment setup" :step="stepIndex">
        <component :is="outlet" />
      </WizardChrome>
    </template>
  </JourneyHost>
</template>
```

Outlet props (`onFinished`, `onStepError`, `errorComponent`, `preload`,
`leafOnly`, `retryLimit`, …) pass straight through `<JourneyHost>` to the inner
`<JourneyOutlet>`.

---

## 3. Lifecycle rules (memorize these four)

These match the React binding exactly:

1. **Start means resume under persistence.** `useJourneyHost` calls
   `runtime.start()` on mount. With a persistence adapter configured, `start()`
   returns the in-flight instance for the same `keyFor(input)` instead of
   minting a new one — this is what lets a modal close and reopen and pick the
   wizard back up.
2. **The instance is fixed for the host's lifetime.** `handle` / `input` /
   `runtime` are read once at setup. Changing `input` later does **not**
   restart. To run a different journey (or restart), remount with `:key`.
3. **Abandon on unmount, deferred one microtask.** An open → close → reopen
   within a tick, a `<KeepAlive>` toggle, or an HMR/transition-driven remount
   won't tear the instance down.
4. **`instanceId` may be `null` on the first render.** Every composable no-ops
   on `null`, so you can call them unconditionally above an early return.

---

## 4. Modal-mounted journeys (no URL) — the primary recipe

The board-app case: the wizard lives in a modal opened by a store boolean, runs
entirely outside route navigation, and resumes where it left off when reopened.
**No `useRoute` / `useRouter` anywhere.**

```vue
<script setup lang="ts">
import { JourneyHost } from "@modular-vue/journeys";
import { envSetupHandle } from "~/journeys/env-setup";

const ui = useUiStore(); // ui.envSetupOpen is a boolean
const props = defineProps<{ frameId: string }>();

function onFinished() {
  ui.envSetupOpen = false; // terminal exit closes the modal
}
</script>

<template>
  <UModal v-model:open="ui.envSetupOpen">
    <!-- Fresh instance per frame: keying on frameId means re-targeting a
         different frame is a new instance, not a hand-cleared old one. This is
         what replaces resetFlowState(). -->
    <JourneyHost
      :key="frameId"
      :handle="envSetupHandle"
      :input="{ frameId }"
      @finished="onFinished"
    >
      <template #default="{ stepIndex, instance, outlet }">
        <WizardChrome :step="stepIndex" :total="4">
          <component :is="outlet" />
          <template #footer>
            <!-- Cancel semantics — pick one:
                 rewind a step:   runtime.goBack(instance.id)
                 close & keep:    ui.envSetupOpen = false   (persistence resumes on reopen)
                 close & discard: runtime.abandon(instance.id); ui.envSetupOpen = false -->
            <button data-testid="wizard-back" @click="runtime.goBack(instance.id)">Back</button>
          </template>
        </WizardChrome>
      </template>
    </JourneyHost>
  </UModal>
</template>
```

**Cancel vs. close.** Closing the modal without abandoning leaves the instance
persisted — reopening resumes it. `runtime.goBack(id)` rewinds one step;
`runtime.abandon(id)` drops the in-flight instance so the next open starts
fresh.

To resume-on-reopen, configure a persistence adapter (next section). Without
one, each open of a freshly-keyed host starts a new instance.

---

## 5. Persistence

### Web Storage (the 80% case)

```ts
import { createWebStoragePersistence } from "@modular-vue/journeys";

const persistence = createWebStoragePersistence<EnvSetupInput, EnvSetupState>({
  keyFor: ({ journeyId, input }) => `journey:${input.frameId}:${journeyId}`,
});

registry.registerJourney(envSetup, { persistence });
```

### Pinia-backed persistence

When you want in-flight journeys to live in your existing Pinia store tree —
visible in Pinia devtools, clearable through the same `$reset` path as the rest
of your state — use `createPiniaJourneyPersistence`. It is the Vue-ecosystem
analog of `createWebStoragePersistence`, keyed the same way, but backed by a
Pinia store **you own**.

> **No Pinia dependency.** `@modular-vue/journeys` takes no `pinia` dependency
> — the adapter is structural, and you pass the store in. (Tracker decision D3:
> "do not take a Pinia dependency in runtime packages.")

```ts
import { defineStore } from "pinia";
import { createPiniaJourneyPersistence, type SerializedJourney } from "@modular-vue/journeys";

// A tiny store whose only job is to hold serialized journeys.
const useJourneyStore = defineStore("journeys", {
  state: () => ({ journeys: {} as Record<string, SerializedJourney<EnvSetupState>> }),
});

const persistence = createPiniaJourneyPersistence<EnvSetupInput, EnvSetupState>({
  keyFor: ({ journeyId, input }) => `journey:${input.frameId}:${journeyId}`,
  // A getter, so the store is resolved inside an active Pinia scope; return
  // null under SSR to force the no-op path (client-only resume, like web storage).
  store: () => useJourneyStore(),
});

registry.registerJourney(envSetup, { persistence });
```

By default `load` returns a plain object detached from the store (safe to
mutate). Pass `clone: false` to hand back the live reactive entry instead; note
Pinia always wraps stored state in a reactive proxy, so even un-cloned `load`
never returns the exact reference you saved. Use a custom `stateKey` if the
record lives under a property other than `journeys`.

Prefer the shipped adapter over hand-rolling a `JourneyPersistence` so every
consumer keys and serializes identically — but if you need something bespoke,
the contract is just four methods (`keyFor` / `load` / `save` / `remove`).

### Pinia store behind the neutral `Store<T>` contract

To let a Pinia store fill a registry-owned `Store<T>` / reactive-service DI slot
— the same slot a zustand or core `createStore` store fills — adapt it with
`createPiniaStoreAdapter` (from `@modular-vue/vue`). This closes the deferred
Store<T> Pinia interop (tracker D3) without a parallel state layer.

```ts
import { createPiniaStoreAdapter, storeRef } from "@modular-vue/vue";

const wizardStore = useWizardStore(); // a Pinia store
const adapted = createPiniaStoreAdapter(wizardStore); // satisfies Store<WizardState>

// Hand `adapted` to the registry's deps bucket, or bridge into Vue reactivity:
const state = storeRef(adapted);
```

`getState` / `getInitialState` / `setState` / `subscribe` behave exactly like
the built-in `createStore`: `setState(partial)` merges via `$patch`,
`setState(next, true)` replaces `$state`, and `subscribe` fires synchronously
with a fresh snapshot identity per change (so `useSyncExternalStore` / `storeRef`
consumers see a real change signal). Again — no `pinia` dependency; the store
is structural.

---

## 6. URL sync (opt-in)

Modal wizards don't touch the URL. When you _do_ want step↔URL sync (a
route-hosted journey, deep-linkable steps), call `useJourneySync` in the same
component that owns the instance, supplying a router-neutral `JourneySyncPort`:

```ts
import { useJourneySync } from "@modular-vue/journeys";

useJourneySync(instanceId, port, { basePath: "/setup" });
```

The reconciler (`createJourneySync`) is framework- and router-neutral and lives
in the engine; `useJourneySync` is only the Vue lifetime wrapper. Supply a
`JourneySyncPort` that adapts your router (`read` / `push` / `replace` / `go` /
`subscribe`). A vue-router port is a thin wrapper you can write against
`createMemoryJourneySyncPort` as a reference — it is intentionally left to the
app so the binding takes no `vue-router` dependency.

---

## 7. Nuxt / router-owning shells

In the router-owning path (`installModularApp`, or any `app.use(manifest)`
shell), the journey runtime is threaded **app-wide automatically** — the
journeys plugin contributes its runtime through its `appProvides` hook, exactly
how `navigation` / `modules` / `slots` reach the app there. So a
`<JourneyOutlet>` mounted anywhere under `<router-view>` resolves the runtime
with **no** `<JourneyProvider>` wrap:

```ts
// plugins/modular.client.ts
export default defineNuxtPlugin((nuxtApp) => {
  const registry = buildRegistry(); // .use(journeysPlugin())
  const manifest = installModularApp(nuxtApp, registry, { parentRouteName: "app" });
  return { provide: { modular: manifest } };
  // app.use(manifest) — done by installModularApp — already provides journeyKey.
});
```

`installModularApp` stays journey-unaware: an app that registers no
`journeysPlugin()` provides nothing extra. When you need to wire a runtime
**without** the plugin (a hand-built runtime, a second app under SSR, or a
subtree override), use the explicit `provideJourneyRuntime(app, runtime)` helper
— the journeys analog of `provideNavigation` / `provideSlots`.

In the framework-mode component path (`resolveManifest`), the plugin's
`<JourneyProvider>` is threaded into the `Providers` stack instead, so the same
"no hand-wiring" property holds — this mirrors the React runtime, which wraps
its tree in `<JourneyProvider>` in every mode.

---

## 8. Testing

`@modular-vue/journeys/testing` re-exports the engine's headless drivers
(`createTestHarness`, `simulateJourney`), mirroring
`@modular-react/journeys/testing`, so journey step logic is unit-testable
without mounting a component:

```ts
import { createTestHarness } from "@modular-vue/journeys/testing";
```

---

## See also

- [Framework-Mode Integration (Nuxt 3)](./framework-mode-nuxt.md) — the
  router-owning install path this guide's §7 builds on.
- [Vue support tracker](./vue-support-tracker.md) — decisions D3 (Pinia
  interop) and D4 (authoring style) behind this binding.
- `@modular-react/journeys` — the reference React binding these APIs mirror.
