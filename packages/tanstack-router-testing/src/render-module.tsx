import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { createMemoryHistory, createRouter, createRootRoute } from "@tanstack/react-router";
import { SharedDependenciesContext, separateDeps } from "@tanstack-react-modules/core";
import type { ModuleDescriptor, SlotMap } from "@tanstack-react-modules/core";
import type { ModuleEntry } from "@modular-react/core";
import { evaluateDynamicSlots } from "@modular-react/core";
import { SlotsContext, ModulesContext } from "@modular-react/react";
import { RouterProvider } from "@tanstack/react-router";
import type { StoreApi } from "zustand";

export interface RenderModuleOptions<TSharedDependencies extends Record<string, any>> {
  /** Initial route to navigate to (only used for modules with createRoutes) */
  route?: string;

  /**
   * Shared dependencies to provide.
   * StoreApi instances go into stores, ReactiveService instances into reactiveServices,
   * everything else into services — all auto-detected.
   */
  deps: Partial<{
    [K in keyof TSharedDependencies]: StoreApi<TSharedDependencies[K]> | TSharedDependencies[K];
  }>;

  /** Mock slot data for the module under test */
  slots?: SlotMap;

  /**
   * Props to pass to the module's component.
   * Only used for component-only modules (no createRoutes).
   */
  props?: Record<string, unknown>;
}

function buildModuleEntry(module: ModuleDescriptor<any>): ModuleEntry {
  return {
    id: module.id,
    version: module.version,
    meta: module.meta,
    component: module.component,
    zones: module.zones,
  };
}

/**
 * Renders a reactive module in isolation for testing.
 *
 * Supports both route-based modules (with createRoutes) and
 * component-only modules (with component, no routes).
 */
export async function renderModule<TSharedDependencies extends Record<string, any>>(
  module: ModuleDescriptor<TSharedDependencies>,
  options: RenderModuleOptions<TSharedDependencies>,
): Promise<RenderResult> {
  const { stores, services, reactiveServices } = separateDeps(
    options.deps as Record<string, unknown>,
  );
  const moduleEntry = buildModuleEntry(module);
  let slots: SlotMap = options.slots ?? {};

  // Evaluate dynamic slots if the module has them
  if (module.dynamicSlots) {
    const flatDeps: Record<string, unknown> = {};
    if (stores) {
      for (const [key, store] of Object.entries(stores)) {
        flatDeps[key] = (store as StoreApi<unknown>).getState();
      }
    }
    for (const [key, service] of Object.entries(services)) {
      flatDeps[key] = service;
    }
    for (const [key, rs] of Object.entries(reactiveServices)) {
      flatDeps[key] = (rs as { getSnapshot: () => unknown }).getSnapshot();
    }

    slots = evaluateDynamicSlots(
      slots as any,
      [
        module.dynamicSlots as (
          deps: Record<string, unknown>,
        ) => Record<string, readonly unknown[]>,
      ],
      flatDeps,
    );
  }

  if (module.createRoutes) {
    const rootRoute = createRootRoute({});
    const moduleRoutes = module.createRoutes(rootRoute);
    const routeTree = rootRoute.addChildren([moduleRoutes]);

    const memoryHistory = createMemoryHistory({
      initialEntries: [options.route ?? "/"],
    });

    const router = createRouter({
      routeTree,
      history: memoryHistory,
    });

    await router.load();

    return render(
      <SharedDependenciesContext value={{ stores, services, reactiveServices }}>
        <SlotsContext value={slots}>
          <ModulesContext value={[moduleEntry]}>
            <RouterProvider router={router} />
          </ModulesContext>
        </SlotsContext>
      </SharedDependenciesContext>,
    );
  }

  if (module.component) {
    const Component = module.component;

    return render(
      <SharedDependenciesContext value={{ stores, services, reactiveServices }}>
        <SlotsContext value={slots}>
          <ModulesContext value={[moduleEntry]}>
            <Component {...(options.props ?? {})} />
          </ModulesContext>
        </SlotsContext>
      </SharedDependenciesContext>,
    );
  }

  throw new Error(
    `[@tanstack-react-modules/testing] Module "${module.id}" has neither createRoutes nor component. ` +
      "renderModule requires at least one of these.",
  );
}
