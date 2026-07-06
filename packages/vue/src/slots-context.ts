import {
  defineComponent,
  inject,
  isRef,
  onScopeDispose,
  provide,
  shallowRef,
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
