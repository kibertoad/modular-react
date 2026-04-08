import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { RouteObject } from "react-router";
import { SharedDependenciesContext, separateDeps } from "@react-router-modules/core";
import type { ReactiveModuleDescriptor, SlotMap } from "@react-router-modules/core";
import { SlotsContext, evaluateDynamicSlots } from "@react-router-modules/runtime";
import { ModulesContext } from "@react-router-modules/runtime";
import type { ModuleEntry } from "@react-router-modules/runtime";
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

function buildModuleEntry(module: ReactiveModuleDescriptor<any>): ModuleEntry {
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
 *
 * @example Route-based module
 * const result = await renderModule(billingModule, {
 *   route: '/billing',
 *   deps: {
 *     auth: createMockStore<AuthStore>({ user: testUser, isAuthenticated: true }),
 *     api: { get: vi.fn(), post: vi.fn() },
 *   },
 * })
 *
 * @example Component-only module
 * const result = await renderModule(ddSetupModule, {
 *   deps: {
 *     auth: createMockStore<AuthStore>({ ... }),
 *     httpClient: { get: vi.fn() },
 *   },
 *   props: { customerId: '123', accountNumber: 'A001' },
 * })
 */
export async function renderModule<TSharedDependencies extends Record<string, any>>(
  module: ReactiveModuleDescriptor<TSharedDependencies>,
  options: RenderModuleOptions<TSharedDependencies>,
): Promise<RenderResult> {
  const { stores, services, reactiveServices } = separateDeps(
    options.deps as Record<string, unknown>,
  );
  const moduleEntry = buildModuleEntry(module);
  let slots: SlotMap = options.slots ?? {};

  // Evaluate dynamic slots if the module has them
  if (module.dynamicSlots) {
    // Build a flat deps snapshot for the dynamicSlots function
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
    // Route-based module — build routes and render via RouterProvider
    const moduleRoutes = module.createRoutes();
    const routes: RouteObject[] = Array.isArray(moduleRoutes) ? moduleRoutes : [moduleRoutes];

    const router = createMemoryRouter(routes, {
      initialEntries: [options.route ?? "/"],
    });

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
    // Component-only module — render directly inside providers
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
    `[@react-router-modules/testing] Module "${module.id}" has neither createRoutes nor component. ` +
      "renderModule requires at least one of these.",
  );
}
