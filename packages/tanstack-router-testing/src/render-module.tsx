import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { createMemoryHistory, createRouter, createRootRoute } from "@tanstack/react-router";
import { SharedDependenciesContext, separateDeps } from "@tanstack-react-modules/core";
import type { ReactiveModuleDescriptor, SlotMap } from "@tanstack-react-modules/core";
import { SlotsContext } from "@tanstack-react-modules/runtime";
import { ModulesContext } from "@tanstack-react-modules/runtime";
import type { ModuleEntry } from "@tanstack-react-modules/runtime";
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
  const slots = options.slots ?? {};

  if (module.createRoutes) {
    // Route-based module — build a router and render via RouterProvider
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
    `[@tanstack-react-modules/testing] Module "${module.id}" has neither createRoutes nor component. ` +
      "renderModule requires at least one of these.",
  );
}
