import {
  DestroyRef,
  inject,
  InjectionToken,
  isSignal,
  type Provider,
  signal,
  type Signal,
} from "@angular/core";
import type {
  DynamicSlotFactory,
  ReactiveService,
  SlotFilter,
  Store,
} from "@modular-frontend/core";
import { buildDepsSnapshot, evaluateDynamicSlots } from "@modular-frontend/core";
import { type InjectionContextOptions, runInContext } from "./injection-context.js";

/**
 * Injection token holding the resolved slot contributions. Always a `Signal` so
 * dynamic slots can update in place; static providers wrap their object in one.
 */
export const SLOTS = new InjectionToken<Signal<object>>("modular-angular.slots");

/** Injection token holding the imperative "recalculate dynamic slots" trigger. */
export const RECALCULATE_SLOTS = new InjectionToken<() => void>("modular-angular.recalculateSlots");

const noop = () => {};

/**
 * Provider factory for a static set of slot contributions. Accepts a plain
 * object or an existing `Signal`; a plain object is wrapped in a signal so
 * consumers always inject a `Signal`. Analog of rendering
 * `<SlotsContext value={slots}>`.
 */
export function provideSlots(slots: object | Signal<object>): Provider {
  const slotsSignal = isSignal(slots) ? slots : signal(slots).asReadonly();
  return { provide: SLOTS, useValue: slotsSignal };
}

/**
 * Access the collected slot contributions from all registered modules as a
 * reactive `Signal`. Must be used within a modular app (or given an explicit
 * `{ injector }`).
 *
 * @example
 * readonly slots = injectSlots<AppSlots>()
 * this.slots().commands // CommandDefinition[] from all modules
 */
export function injectSlots<TSlots extends { [K in keyof TSlots]: readonly unknown[] }>(
  options?: InjectionContextOptions,
): Signal<TSlots> {
  return runInContext(options, injectSlots, () => {
    const slots = inject(SLOTS, { optional: true });
    if (!slots) {
      throw new Error("[@modular-angular/angular] injectSlots must be used within a modular app.");
    }
    return slots as Signal<TSlots>;
  });
}

/**
 * Provider factory installing the imperative recalculate trigger the runtime
 * wires to a {@link SlotsSignal}. Consumers read it with
 * {@link injectRecalculateSlots}.
 */
export function provideRecalculateSlots(recalculate: () => void): Provider {
  return { provide: RECALCULATE_SLOTS, useValue: recalculate };
}

/**
 * Returns a function that triggers re-evaluation of dynamic slots.
 *
 * Use this inside module components when a local action should cause dynamic
 * slot contributions to be recalculated — for example after toggling a feature
 * flag or completing a flow that changes permissions.
 *
 * No-op when no module uses `dynamicSlots` and no `slotFilter` is configured.
 *
 * @example
 * readonly recalculateSlots = injectRecalculateSlots()
 *
 * async handleRoleChange(userId: string, role: string) {
 *   await this.api.updateRole(userId, role)
 *   this.recalculateSlots()
 * }
 */
export function injectRecalculateSlots(options?: InjectionContextOptions): () => void {
  return runInContext(
    options,
    injectRecalculateSlots,
    () => inject(RECALCULATE_SLOTS, { optional: true }) ?? noop,
  );
}

/**
 * Minimal pub/sub signal — one producer (`notify`) triggers all subscribers.
 * Used to connect the imperative `recalculateSlots()` trigger to
 * {@link provideDynamicSlots}. (Distinct from an Angular `Signal`; this is the
 * framework-neutral analog of the Vue `SlotsSignal`.)
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

/** Configuration for {@link provideDynamicSlots}. */
export interface DynamicSlotsConfig {
  baseSlots: object;
  factories: readonly DynamicSlotFactory[];
  filter?: SlotFilter;
  stores: Record<string, Store<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  signal: SlotsSignal;
}

/**
 * Provider factory that re-evaluates dynamic slot factories when
 * `recalculateSlots()` fires (via the signal) and exposes the resolved slots on
 * the {@link SLOTS} token as a reactive `Signal`. Install instead of
 * {@link provideSlots} when at least one dynamic slot factory or a slotFilter
 * exists.
 *
 * Analog of the React/Vue `DynamicSlotsProvider` component. In Angular the same
 * job is a plain provider factory — no component or template — so it stays in
 * this plain-TS package (AD3): the factory runs in an injection context, seeds a
 * writable signal, and tears its subscription down via `DestroyRef.onDestroy`.
 */
export function provideDynamicSlots(config: DynamicSlotsConfig): Provider {
  return {
    provide: SLOTS,
    useFactory: () => {
      const computeSlots = (): object => {
        // Same snapshot contract the runtime uses at resolve() time — reads
        // store state and reactive-service snapshots, passes services through.
        const deps = buildDepsSnapshot<Record<string, unknown>>({
          stores: config.stores,
          services: config.services,
          reactiveServices: config.reactiveServices,
        });
        return evaluateDynamicSlots(config.baseSlots as any, config.factories, deps, config.filter);
      };

      const resolved = signal(computeSlots());
      const unsubscribe = config.signal.subscribe(() => {
        resolved.set(computeSlots());
      });
      inject(DestroyRef).onDestroy(unsubscribe);
      return resolved.asReadonly();
    },
  };
}
