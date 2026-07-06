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
  `useRecalculateSlots`, `DynamicSlotsProvider`, `createSlotsSignal`).

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
