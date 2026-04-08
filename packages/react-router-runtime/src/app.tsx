import { useMemo, useState, useEffect, useCallback } from "react";
import { RouterProvider } from "react-router";
import type { DataRouter } from "react-router";
import type { StoreApi } from "zustand";
import type { ReactiveService } from "@react-router-modules/core";
import { SharedDependenciesContext } from "@react-router-modules/core";
import { NavigationContext } from "./navigation-context.js";
import { SlotsContext, RecalculateSlotsContext } from "./slots-context.js";
import { ModulesContext } from "./modules-context.js";
import { evaluateDynamicSlots } from "./slots.js";
import type { DynamicSlotFactory, SlotFilter } from "./slots.js";
import type { NavigationManifest, ModuleEntry } from "./types.js";

/**
 * Minimal pub/sub signal — one producer (`notify`) triggers
 * all subscribers. Used to connect the imperative `recalculateSlots()`
 * function to the React-side `DynamicSlotsProvider`.
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

interface AppProps {
  router: DataRouter;
  stores: Record<string, StoreApi<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  navigation: NavigationManifest;
  slots: object;
  modules: readonly ModuleEntry[];
  providers?: React.ComponentType<{ children: React.ReactNode }>[];
  dynamicSlotFactories: DynamicSlotFactory[];
  slotFilter?: SlotFilter;
  slotsSignal: SlotsSignal;
  recalculateSlots: () => void;
}

/**
 * Provider that re-evaluates dynamic slot factories when
 * `recalculateSlots()` is called (via the signal).
 *
 * Only mounted when at least one dynamic slot factory or slotFilter exists.
 */
function DynamicSlotsProvider({
  baseSlots,
  factories,
  filter,
  stores,
  services,
  reactiveServices,
  signal,
  children,
}: {
  baseSlots: object;
  factories: readonly DynamicSlotFactory[];
  filter: SlotFilter | undefined;
  stores: Record<string, StoreApi<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  signal: SlotsSignal;
  children: React.ReactNode;
}) {
  // All props are stable references created once at resolve() time,
  // so useCallback with empty deps is correct.
  const computeSlots = useCallback(() => {
    const deps: Record<string, unknown> = {};
    for (const [key, store] of Object.entries(stores)) {
      deps[key] = store.getState();
    }
    for (const [key, service] of Object.entries(services)) {
      deps[key] = service;
    }
    for (const [key, rs] of Object.entries(reactiveServices)) {
      deps[key] = rs.getSnapshot();
    }
    return evaluateDynamicSlots(baseSlots as any, factories, deps, filter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- all closure values are stable from resolve()

  const [resolvedSlots, setResolvedSlots] = useState(computeSlots);

  useEffect(() => {
    const unsubscribe = signal.subscribe(() => setResolvedSlots(computeSlots()));
    // Catch any recalculateSlots() calls that fired between initial render and this effect
    setResolvedSlots(computeSlots());
    return unsubscribe;
  }, [computeSlots, signal]);

  return <SlotsContext value={resolvedSlots}>{children}</SlotsContext>;
}

export function createAppComponent({
  router,
  stores,
  services,
  reactiveServices,
  navigation,
  slots,
  modules,
  providers,
  dynamicSlotFactories,
  slotFilter,
  slotsSignal,
  recalculateSlots,
}: AppProps) {
  // All values captured in closure are stable references created once at resolve() time.
  // Wrap in a stable object so context consumers don't re-render on parent renders.
  const depsValue = { stores, services, reactiveServices };
  const hasDynamicSlots = dynamicSlotFactories.length > 0 || slotFilter != null;

  function App() {
    const tree = useMemo(() => {
      // When dynamic slots exist, use a provider that re-evaluates
      // on recalculateSlots(). Otherwise, use static context for zero overhead.
      const slotsProvider = hasDynamicSlots ? (
        <DynamicSlotsProvider
          baseSlots={slots}
          factories={dynamicSlotFactories}
          filter={slotFilter}
          stores={stores}
          services={services}
          reactiveServices={reactiveServices}
          signal={slotsSignal}
        >
          <ModulesContext value={modules}>
            <RouterProvider router={router} />
          </ModulesContext>
        </DynamicSlotsProvider>
      ) : (
        <SlotsContext value={slots}>
          <ModulesContext value={modules}>
            <RouterProvider router={router} />
          </ModulesContext>
        </SlotsContext>
      );

      let node: React.ReactNode = (
        <SharedDependenciesContext value={depsValue}>
          <NavigationContext value={navigation}>
            <RecalculateSlotsContext value={recalculateSlots}>
              {slotsProvider}
            </RecalculateSlotsContext>
          </NavigationContext>
        </SharedDependenciesContext>
      );

      // Wrap with user-supplied providers (first element = outermost wrapper)
      if (providers) {
        for (const Provider of [...providers].reverse()) {
          node = <Provider>{node}</Provider>;
        }
      }

      return node;
    }, []);

    return tree;
  }

  App.displayName = "ReactiveApp";
  return App;
}
