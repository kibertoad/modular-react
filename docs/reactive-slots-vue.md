# Reactive slots in Vue (`useReactiveSlots`)

Vue hosts have two ways to read the resolved slot manifest. They coexist, read
the same underlying config, and you pick per source:

- **`useReactiveSlots()`** — the resolved slots as a Vue `computed`, re-evaluated
  automatically when the reactive state its factories/filter read changes.
- **`useSlots()` + `useRecalculateSlots()`** — the framework-neutral signal path:
  a `Ref` that only re-evaluates when application code calls `recalculateSlots()`.

The React binding has only the signal path, because React has no ambient
reactivity to track. Vue does, so `useReactiveSlots` is added as the idiomatic
option for gating logic whose inputs are already reactive Vue state.

## The one thing to understand first

Dynamic slot evaluation reads its inputs through a **deps snapshot**
(`buildDepsSnapshot`): `store.getState()` per store, `getSnapshot()` per reactive
service, plain services passed by reference. That snapshot is a plain object.

`useReactiveSlots` rebuilds that snapshot **inside a `computed`** on every
recompute and runs the factories/filter there. So a factory or filter that reads
a **reactive** source _live_ during evaluation makes it a tracked dependency of
the computed:

- a plain service object with getters over `ref`/`reactive`/`computed` (read at
  evaluation time),
- a reactive service whose `getSnapshot()` reads reactive state,
- a store adapter whose `getState()` returns a reactive proxy.

A factory that reads a **non-reactive** snapshot (a value already read out of the
reactive system, e.g. a vanilla `createStore().getState()`) tracks nothing, so the
computed will never recompute for it. That is not a bug; it is the boundary
between the two paths.

## When to use which

| Situation | Path | Why |
| --- | --- | --- |
| Gating on Vue-reactive state the host owns (RBAC permissions, connection-availability flags, feature toggles in `ref`/`reactive`/Pinia) | `useReactiveSlots` | No invalidation call sites to maintain, so it can't go stale by omission; fine-grained tracking recomputes only on the state that actually changed |
| Gating on a non-reactive `Store`/zustand snapshot or an external `subscribe`/`getSnapshot` source read via `getState()`/`getSnapshot()` | signal | A `computed` reading a plain snapshot tracks nothing. Either bridge the source into a ref first, or invalidate explicitly with `recalculateSlots()` |
| A framework-neutral module used in both a React and a Vue host | signal | The shared contract is `dynamicSlots(deps)` + `recalculateSlots()`. (The factory itself is agnostic to how it's invoked, so a portable factory still runs fine under the reactive path in the Vue host — but the invalidation contract you author against is the signal.) |
| Several async-staged changes that should recompute the manifest **once** at the end, not on each intermediate tick | signal | An explicit `recalculateSlots()` after the transaction gives one clean recompute. Vue already batches synchronous writes within a tick, so this only matters for async multi-step changes |
| The trigger is an imperative event, not persisted reactive state ("reload config" button, a websocket message) | signal | The signal is the direct expression of "recompute now" |

Rule of thumb: **reactive path when the gating inputs are reactive state the host
owns; signal path when they are non-reactive/external, or when you need
transactional or event-driven control.** It is a property of the _source_, not of
React-vs-Vue.

## Is the reactive path over-eager? No

A common worry is that a reactive slots value recomputes on every tick of
anything. A Vue `computed` does not behave that way:

- **Lazy + cached.** It only recomputes when it is _read_ and a tracked dep
  actually changed. Between changes, reads return the memoized value. If no
  mounted component reads it, it does not run.
- **Fine-grained.** It tracks exactly the reactive sources touched during
  evaluation. If the filter reads two permission flags, it invalidates on those
  two, not on unrelated store mutations. This is more precise than
  `recalculateSlots()`, which is coarse: one call rebuilds the whole manifest
  regardless of what changed.
- **Value-gated downstream.** Wrapped in a computed/`shallowRef`, watchers only
  wake when the produced array reference actually changes.

So the recompute edge is `reactive source -> computed slots -> render`. The
source change is the trigger, the same producer-driven model as a manual
`recalculateSlots()`, except Vue wires that edge declaratively instead of by
hand.

## Host-owned RBAC gating (the canonical shape)

Register the gating state as a **reactive service** (a plain service object whose
getters read your reactive permission/availability state), then express the
gating as a `slotFilter` that reads it. Modules contribute their nav/command
items as plain data, each tagging the permission it needs. The shell reads the
already-gated manifest and stays a dumb renderer.

```ts
// In the host plugin, where Pinia/composables are available:
const access = useWorkspaceAccess() // reactive computeds
const gates = {
  get 'board.write'() { return access.canWriteBoard.value },
  get 'integrations.manage'() { return access.canManageIntegrations.value },
  // ...
}

const registry = createRegistry<AppDeps, AppSlots>({
  services: { gates }, // passed by reference, read live inside the computed
  slots: { nav: [] },
})
// register modules that contribute nav items as data, each with a `gate` key...

const manifest = installModularApp(nuxtApp, registry, {
  slotFilter: (slots, deps) => ({
    ...slots,
    nav: slots.nav.filter((i) => i.gate == null || deps.gates[i.gate]),
  }),
})
```

```ts
// In the SideBar / CommandBar / Toolbar shells:
const slots = useReactiveSlots<AppSlots>()
const navItems = computed(() => slots.value.nav) // updates when a permission flips
```

When a permission flips (the snapshot the auth layer attached changes), the
`gates` getter returns a new value, the `slotFilter` reads it inside the
`useReactiveSlots` computed, and every shell reading `slots.value.nav`
recomputes. No `recalculateSlots()` call anywhere.

## API

```ts
function useReactiveSlots<TSlots>(): ComputedRef<TSlots>
```

Injects the reactive-slots config the runtime provides at install time (base
slots, collected `dynamicSlots` factories, the global `slotFilter`) plus the
shared-dependency buckets, and returns a `computed` that re-runs
`evaluateDynamicSlots` on each recompute. Throws if called outside an installed
modular app.

The signal path is unchanged: `useSlots()` returns the `Ref`, and
`useRecalculateSlots()` returns the invalidation trigger. Both remain available;
`useReactiveSlots` does not replace them.

## See also

- [Framework-mode (Nuxt)](framework-mode-nuxt.md) — the `ssr: false` layer setup
  and the consumer-contribution seam these shells build on.
- [Navigation](navigation.md) — the navigation manifest and item shape.
- [Remote capability manifests](remote-capability-manifests.md) — backend-driven
  slot/nav contributions, which compose with either path.
