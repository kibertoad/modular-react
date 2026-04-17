import type { StoreApi } from "zustand";
import type { ReactiveService } from "@react-router-modules/core";
import { SharedDependenciesContext } from "@react-router-modules/core";
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

export interface ProvidersProps {
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
 * Factory that builds the context provider stack shared by `resolve()` and
 * `resolveManifest()`. Returns a component whose children render inside the
 * full modular-react context tree — shared deps, navigation, slots, module
 * registry, and any user-supplied providers.
 *
 * Use via `resolveManifest().Providers` in framework-mode integrations where
 * the host owns routing (React Router `@react-router/dev/vite`, etc.).
 *
 * The returned component does not memoize its output — it doesn't need to.
 * All context values are captured in closure at factory time (stable
 * references); React contexts only re-render consumers when their `value`
 * prop changes by reference. Re-rendering the provider tree itself is cheap.
 */
export function createProvidersComponent({
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
}: ProvidersProps): React.ComponentType<{ children: React.ReactNode }> {
  const depsValue = { stores, services, reactiveServices };
  const hasDynamicSlots = dynamicSlotFactories.length > 0 || slotFilter != null;

  function Providers({ children }: { children: React.ReactNode }) {
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
        <ModulesContext value={modules}>{children}</ModulesContext>
      </DynamicSlotsProvider>
    ) : (
      <SlotsContext value={slots}>
        <ModulesContext value={modules}>{children}</ModulesContext>
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

    if (providers) {
      for (const Provider of [...providers].reverse()) {
        node = <Provider>{node}</Provider>;
      }
    }

    return node;
  }

  Providers.displayName = "ModularProviders";
  return Providers;
}
