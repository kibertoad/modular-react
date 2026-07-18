import {
  computed,
  defineComponent,
  inject,
  isRef,
  onScopeDispose,
  provide,
  shallowRef,
  type ComputedRef,
  type InjectionKey,
  type PropType,
  type Ref,
} from "vue";
import type {
  DynamicSlotFactory,
  ReactiveService,
  SlotFilter,
  Store,
} from "@modular-frontend/core";
import { buildDepsSnapshot, evaluateDynamicSlots } from "@modular-frontend/core";

/**
 * Injection key holding the resolved slot contributions. Always a `Ref` so
 * dynamic slots can update in place; static providers wrap their object in one.
 */
export const slotsKey: InjectionKey<Ref<object>> = Symbol("modular-vue.slots");

const noop = () => {};

/** Injection key holding the imperative "recalculate dynamic slots" trigger. */
export const recalculateSlotsKey: InjectionKey<() => void> = Symbol("modular-vue.recalculateSlots");

/**
 * Injection key holding the single resolved reactive-slots source — one shared
 * `computed` the runtime builds once at install time and every
 * {@link useReactiveSlots} consumer reads. The reactive analog of {@link slotsKey}
 * (which holds the one shared `Ref` the signal path resolves once): both paths
 * are "runtime resolves once → provide → composable injects", differing only in
 * evaluation mode (tracked `computed` here, imperatively-updated `Ref` there).
 */
export const reactiveSlotsKey: InjectionKey<ComputedRef<object>> = Symbol(
  "modular-vue.reactiveSlots",
);

/**
 * Everything {@link resolveReactiveSlots} needs to evaluate the slot manifest:
 * the static base slots, the collected `dynamicSlots` factories, the optional
 * global `slotFilter`, and the three shared-dependency buckets the snapshot is
 * rebuilt from. The runtime assembles this once and hands it to
 * {@link resolveReactiveSlots}.
 */
export interface ReactiveSlotsInput {
  baseSlots: object;
  factories: readonly DynamicSlotFactory[];
  filter?: SlotFilter;
  stores: Record<string, Store<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
}

/**
 * Build the single resolved reactive-slots source: one `computed` that rebuilds
 * the deps snapshot and re-evaluates the factories/filter **inside its getter**,
 * so any reactive source read *live* during evaluation (a reactive service
 * object, a `ref`/`reactive` closed over by a factory, a store whose
 * `getState()` returns a reactive proxy) becomes a tracked dependency of the
 * computed. Vue then recomputes lazily on next read after a relevant change,
 * tracking exactly the state actually read — no `recalculateSlots()` call.
 *
 * The runtime calls this **once** at install time and provides the result via
 * {@link reactiveSlotsKey}; {@link useReactiveSlots} is a thin reader over it, so
 * evaluation happens at most once per change regardless of how many components
 * read it. Create it inside an `effectScope` (plugin install) or a component
 * `setup` (framework-mode) so the computed's effect is disposed with the app.
 */
export function resolveReactiveSlots(input: ReactiveSlotsInput): ComputedRef<object> {
  return computed(() => {
    // Rebuild the snapshot INSIDE the computed so reactive reads performed by the
    // factories / filter (through reactive service objects or reactive stores)
    // are tracked as dependencies of this computed.
    const snapshot = buildDepsSnapshot<Record<string, unknown>>({
      stores: input.stores,
      services: input.services,
      reactiveServices: input.reactiveServices,
    });
    return evaluateDynamicSlots(input.baseSlots as any, input.factories, snapshot, input.filter);
  });
}

/**
 * Provide a static set of slot contributions. Accepts a plain object or an
 * existing `Ref`; a plain object is wrapped in a `shallowRef` so consumers
 * always inject a `Ref`. Analog of rendering `<SlotsContext value={slots}>`.
 */
export function provideSlots(slots: object | Ref<object>): void {
  // `isRef` narrows to `Ref<unknown>`; the parameter type guarantees `Ref<object>`.
  const slotsRef: Ref<object> = isRef(slots) ? (slots as Ref<object>) : shallowRef(slots);
  provide(slotsKey, slotsRef);
}

/**
 * Access the collected slot contributions from all registered modules as a
 * reactive `Ref`. Must be used within a modular app provider tree.
 *
 * @remarks
 * This name intentionally mirrors the React binding's `useSlots`, but it
 * collides with Vue's own `useSlots` from `@vue/runtime-core`. In a component
 * that needs both, import this one under an alias to avoid shadowing the
 * built-in — e.g. `import { useSlots as useModuleSlots } from '@modular-vue/vue'`.
 *
 * @example
 * const slots = useSlots<AppSlots>()
 * slots.value.commands // CommandDefinition[] from all modules
 */
export function useSlots<
  TSlots extends { [K in keyof TSlots]: readonly unknown[] },
>(): Ref<TSlots> {
  const slots = inject(slotsKey, null);
  if (!slots) {
    throw new Error("[@modular-vue/vue] useSlots must be used within a modular app.");
  }
  return slots as Ref<TSlots>;
}

/**
 * Access the resolved slot contributions as a Vue-reactive `computed`, evaluated
 * on read and re-evaluated automatically whenever the reactive state its
 * `dynamicSlots` factories / `slotFilter` touch changes — no `recalculateSlots()`
 * call required.
 *
 * This is the Vue-idiomatic alternative to {@link useSlots} + the imperative
 * {@link useRecalculateSlots} signal. The factories and filter run inside a
 * `computed`, so any reactive source they read *live* during evaluation (a
 * reactive service object, a `ref`/`reactive` closed over by a factory, a store
 * whose `getState()` returns a reactive proxy) becomes a tracked dependency:
 * Vue recomputes lazily on next read after a relevant change, tracking exactly
 * the state actually read.
 *
 * ## When to use which
 *
 * Choose the reactive path (this) when the gating inputs are **Vue-reactive
 * state the host owns** — e.g. RBAC permissions, connection-availability flags,
 * feature toggles held in `ref`/`reactive`/Pinia. It needs no invalidation call
 * sites, so it can't go stale by omission, and its fine-grained tracking only
 * recomputes on the specific state that changed.
 *
 * Choose the signal path ({@link useSlots} + {@link useRecalculateSlots}) when:
 * - the gating inputs are **not Vue-reactive** — a plain `Store`/zustand snapshot,
 *   or an external `subscribe`/`getSnapshot` source read via `getState()` /
 *   `getSnapshot()` (a `computed` reading a plain snapshot tracks nothing, so it
 *   would never recompute); either bridge those into refs first or invalidate
 *   explicitly;
 * - you need **transactional** recompute — apply several async-staged changes and
 *   recompute once at the end rather than on each intermediate reactive tick;
 * - the trigger is an **imperative event** that is not persisted reactive state.
 *
 * The two paths coexist and read the same underlying config; pick per source.
 *
 * @remarks
 * `dynamicSlots(deps)` factories themselves stay framework-neutral — they receive
 * a plain deps snapshot either way. Reactivity is the host's concern here: the
 * runtime resolves one shared `computed` ({@link resolveReactiveSlots}) that
 * rebuilds the snapshot inside its getter, so a factory/filter that reads a
 * reactive dep tracks it. A factory that only reads non-reactive deps simply
 * never triggers a recompute (same result the signal path would give without a
 * `recalculateSlots()` call).
 *
 * This composable is a thin reader over that single shared source — every
 * consumer injects the *same* `computed`, so evaluation happens at most once per
 * change no matter how many components read it (the reactive analog of
 * {@link useSlots} reading the one shared signal `Ref`).
 *
 * @example
 * // Host-owned RBAC gating, expressed as a reactive slotFilter reading a
 * // reactive `gates` service registered on the registry:
 * const slots = useReactiveSlots<AppSlots>()
 * const navItems = computed(() => slots.value.nav)  // updates when a permission flips
 */
export function useReactiveSlots<
  TSlots extends { [K in keyof TSlots]: readonly unknown[] },
>(): ComputedRef<TSlots> {
  const slots = inject(reactiveSlotsKey, null);
  if (!slots) {
    throw new Error(
      "[@modular-vue/vue] useReactiveSlots must be used within a modular app " +
        "(install the resolved manifest so the reactive-slots source is provided).",
    );
  }
  return slots as ComputedRef<TSlots>;
}

/**
 * Returns a function that triggers re-evaluation of dynamic slots.
 *
 * Use this inside module components when a local action should cause
 * dynamic slot contributions to be recalculated — for example after
 * toggling a feature flag or completing a flow that changes permissions.
 *
 * No-op when no module uses `dynamicSlots` and no `slotFilter` is configured.
 *
 * @example
 * const recalculateSlots = useRecalculateSlots()
 *
 * async function handleRoleChange(userId: string, role: string) {
 *   await api.updateRole(userId, role)
 *   recalculateSlots()
 * }
 */
export function useRecalculateSlots(): () => void {
  return inject(recalculateSlotsKey, noop);
}

/**
 * Minimal pub/sub signal — one producer (`notify`) triggers
 * all subscribers. Used to connect the imperative `recalculateSlots()`
 * function to the `DynamicSlotsProvider`.
 */
export interface SlotsSignal {
  subscribe: (fn: () => void) => () => void;
  notify: () => void;
}

export function createSlotsSignal(): SlotsSignal {
  const listeners = new Set<() => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    notify() {
      for (const fn of listeners) fn();
    },
  };
}

/**
 * Provider that re-evaluates dynamic slot factories when
 * `recalculateSlots()` is called (via the signal), and provides the resolved
 * slots to descendants. Only mounted when at least one dynamic slot factory or
 * slotFilter exists. Authored with `defineComponent` + render function (no SFC
 * compiler needed in library builds; see decision D4).
 *
 * Analog of the React `DynamicSlotsProvider`.
 */
export const DynamicSlotsProvider = defineComponent({
  name: "DynamicSlotsProvider",
  props: {
    baseSlots: { type: Object as PropType<object>, required: true },
    factories: { type: Array as PropType<readonly DynamicSlotFactory[]>, required: true },
    filter: { type: Function as PropType<SlotFilter | undefined>, default: undefined },
    stores: { type: Object as PropType<Record<string, Store<unknown>>>, required: true },
    services: { type: Object as PropType<Record<string, unknown>>, required: true },
    reactiveServices: {
      type: Object as PropType<Record<string, ReactiveService<unknown>>>,
      required: true,
    },
    signal: { type: Object as PropType<SlotsSignal>, required: true },
  },
  setup(props, { slots: renderSlots }) {
    // Props are stable references created once at resolve() time.
    function computeSlots(): object {
      // Same snapshot contract as the runtime uses at resolve() time — reads
      // store state and reactive-service snapshots, passes services through.
      const deps = buildDepsSnapshot<Record<string, unknown>>({
        stores: props.stores,
        services: props.services,
        reactiveServices: props.reactiveServices,
      });
      return evaluateDynamicSlots(props.baseSlots as any, props.factories, deps, props.filter);
    }

    const resolvedSlots = shallowRef(computeSlots());
    provide(slotsKey, resolvedSlots);

    const unsubscribe = props.signal.subscribe(() => {
      resolvedSlots.value = computeSlots();
    });
    onScopeDispose(unsubscribe);

    return () => renderSlots.default?.();
  },
});
