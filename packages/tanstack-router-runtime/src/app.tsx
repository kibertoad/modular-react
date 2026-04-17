import { useMemo } from "react";
import { RouterProvider } from "@tanstack/react-router";
import type { Router } from "@tanstack/react-router";
import type { StoreApi } from "zustand";
import type { ReactiveService } from "@tanstack-react-modules/core";
import { SharedDependenciesContext } from "@tanstack-react-modules/core";
import type {
  DynamicSlotFactory,
  SlotFilter,
  NavigationManifest,
  ModuleEntry,
} from "@modular-react/core";
import {
  NavigationContext,
  SlotsContext,
  RecalculateSlotsContext,
  ModulesContext,
  DynamicSlotsProvider,
} from "@modular-react/react";
import type { SlotsSignal } from "@modular-react/react";

interface AppProps {
  router: Router<any, any, any>;
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
  const depsValue = { stores, services, reactiveServices };
  const hasDynamicSlots = dynamicSlotFactories.length > 0 || slotFilter != null;
  // Reverse once at factory time — providers is immutable for the lifetime
  // of the App component and applying them back-to-front wraps so the first
  // entry ends up outermost.
  const providersInnerFirst = providers ? [...providers].reverse() : undefined;

  function App() {
    const tree = useMemo(() => {
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
      if (providersInnerFirst) {
        for (const Provider of providersInnerFirst) {
          node = <Provider>{node}</Provider>;
        }
      }

      return node;
    }, []);

    return tree;
  }

  App.displayName = "ModularApp";
  return App;
}
