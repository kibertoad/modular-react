# @modular-vue/vue

Vue 3 bindings for [`@modular-frontend/core`](../frontend-core): store
composables, scoped stores, and injection-key contexts for modules, navigation,
and slots. This is the Vue analog of [`@modular-react/react`](../react) and the
first package of the [Vue support initiative](../../docs/vue-support-tracker.md)
(PR-10).

> Status: `0.x`, pre-1.0. The API tracks the React binding case-for-case and
> will stay 0.x until the parity audit (PR-42).

## What's here (PR-10 scope: stores and context)

- **Shared-dependency composables** — `createSharedComposables<TDeps>()` returns
  `useStore`, `useService`, `useReactiveService`, and `useOptional`, the Vue
  analogs of the React binding's `createSharedHooks`. Reactive accessors return
  a `Ref`; plain services return the value directly.
- **Scoped stores** — `createScopedStore(initializer)` with a `useScoped`
  composable, for per-entity state.
- **Contexts** — typed `InjectionKey`s plus `provide*` helpers and `use*`
  composables for the modules list (`useModules`, `getModuleMeta`), the
  navigation manifest (`useNavigation`), and slot contributions (`useSlots`,
  `useReactiveSlots`, `useRecalculateSlots`, `DynamicSlotsProvider`,
  `createSlotsSignal`).
- **Subject-keyed panels** — `usePanels` (a reactive `computed` over the slots
  source + subject), `<PanelsOutlet>` (renders every matching panel, ordered,
  subject injected as a prop **and** via `provide`, each in a
  `ModuleErrorBoundary`, with `#empty` / `#wrap` slots), and `usePanelSubject` /
  `panelSubjectKey` for reading the injected subject reactively in panel bodies.
  The Vue host over the framework-neutral engine (`definePanelGroup` /
  `resolvePanels`, re-exported from `@modular-vue/core`); mind the
  [Vue reactivity caveat](../../docs/reactive-slots-vue.md) when a `when`
  predicate reads non-reactive state. See
  [docs/subject-panels.md](../../docs/subject-panels.md).

### Slot evaluation: reactive vs signal

Two ways to read the resolved slots, chosen per source:

- `useReactiveSlots()` returns the slots as a `computed`, re-evaluated
  automatically when the reactive state its factories/filter read changes. Use it
  when the gating inputs are Vue-reactive state the host owns (RBAC permissions,
  availability flags).
- `useSlots()` + `useRecalculateSlots()` is the framework-neutral signal path: a
  `Ref` that re-evaluates only on an explicit `recalculateSlots()`. Use it for
  non-reactive/external sources, transactional recompute, or event-driven
  invalidation.

Full tradeoffs and the RBAC-gating shape:
[Reactive slots in Vue](../../docs/reactive-slots-vue.md).

Rendering pieces (lazy entry resolution, module host/exit, error capture) land
in PR-11; the runtime plugin that installs these contexts lands with the
`@modular-vue/*` family.

## Store bridge

Composables wrap a framework-neutral `Store<T>` (or `ReactiveService<T>`) in a
`shallowRef` and push snapshots into it from the store's `subscribe` callback —
the Vue analog of React's `useSyncExternalStore`. Subscriptions are torn down on
`onScopeDispose` (component unmount), so there is no listener leak. `shallowRef`
dedupes by `Object.is`, which gives selector equality: re-selecting the same
value from an unrelated update does not wake watchers.

### Pinia interop — `createPiniaStoreAdapter`

`createPiniaStoreAdapter(store)` presents a Pinia store behind the neutral
`Store<T>` contract (`getState` / `getInitialState` / `setState` / `subscribe`),
so a Pinia store can fill a registry-owned store / reactive-service DI slot — the
same slot a zustand or built-in `createStore` store fills — instead of running a
parallel state layer. It caches a shallow snapshot and refreshes it from a
synchronous `$subscribe`, so consumers see a fresh snapshot identity per change
(the signal `useSyncExternalStore` / `storeRef` need). Structural store shape —
**no `pinia` dependency**; you pass the store in.

## Example

```ts
// In @myorg/app-shared:
import { createSharedComposables } from "@modular-vue/vue";
import type { AppDependencies } from "@myorg/app-shared";

export const { useStore, useService, useReactiveService, useOptional } =
  createSharedComposables<AppDependencies>();
```

```vue
<script setup lang="ts">
import { useStore, useService } from "@myorg/app-shared";

const user = useStore("auth", (s) => s.user); // Ref → reactive
const api = useService("httpClient"); // plain service → static
</script>

<template>
  <p>Signed in as {{ user }}</p>
</template>
```

## Troubleshooting

- [Duplicate `vue-router` instances](../../docs/troubleshooting-vue-router-instances.md)
  — if `vue-tsc` reports `RouteRecordRaw` "not assignable to" `RouteRecordRaw`
  (same version, different import path), your app resolved two copies of
  `vue-router`. That doc explains why (vue-router 5's optional `vite` peer) and
  how to dedupe with a one-line override.
