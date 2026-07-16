import { defineComponent, h, type Plugin, type VNode } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterView, type RouteRecordRaw } from "vue-router";
import {
  buildDepsSnapshot,
  evaluateDynamicSlots,
  separateDeps,
  type ModuleEntry,
  type ReactiveService,
  type SlotMap,
  type Store,
} from "@modular-frontend/core";
import { provideModules, provideSharedDependencies, provideSlots } from "@modular-vue/vue";
import type { ModuleDescriptor } from "@modular-vue/core";

export interface RenderModuleOptions<TSharedDependencies extends Record<string, any>> {
  /** Initial route to navigate to (only used for modules with createRoutes) */
  route?: string;

  /**
   * Shared dependencies to provide.
   * Store instances go into stores, ReactiveService instances into reactiveServices,
   * everything else into services — all auto-detected.
   */
  deps: Partial<{
    [K in keyof TSharedDependencies]:
      | Store<TSharedDependencies[K]>
      | ReactiveService<TSharedDependencies[K]>
      | TSharedDependencies[K];
  }>;

  /** Mock slot data for the module under test */
  slots?: SlotMap;

  /**
   * Props to pass to the module's component.
   * Only used for component-only modules (no createRoutes).
   */
  props?: Record<string, unknown>;

  /**
   * Render a typed entry point instead of the legacy `component`. The entry
   * receives `{ input, exit }` (and optionally `goBack`) per the
   * `ModuleEntryProps` contract.
   */
  entry?: string;

  /** Input passed to the rendered entry. Required when `entry` is set. */
  input?: unknown;

  /** Exit spy — called when the rendered entry emits an exit. */
  exit?: (name: string, output?: unknown) => void;
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
 * Mount `content` under the three modular injection contexts a real app root
 * provides: shared dependencies, slots, and the module list. Authored with
 * `defineComponent` + a render function (no SFC compiler in the package build,
 * per decision D4). The Vue analog of the React source's nested
 * `<SharedDependenciesContext><SlotsContext><ModulesContext>` wrappers — the
 * `provide*` helpers are the injection-key equivalents of rendering those
 * context providers.
 */
function mountModuleTree(
  content: () => VNode,
  ctx: {
    stores: Record<string, Store<unknown>>;
    services: Record<string, unknown>;
    reactiveServices: Record<string, ReactiveService<unknown>>;
    slots: SlotMap;
    moduleEntry: ModuleEntry;
    plugins?: Plugin[];
  },
): VueWrapper {
  const Wrapper = defineComponent({
    name: "RenderModuleWrapper",
    setup() {
      provideSharedDependencies({
        stores: ctx.stores,
        services: ctx.services,
        reactiveServices: ctx.reactiveServices,
      });
      provideSlots(ctx.slots);
      provideModules([ctx.moduleEntry]);
      return content;
    },
  });
  return mount(Wrapper, { global: { plugins: ctx.plugins ?? [] } });
}

/**
 * Renders a reactive module in isolation for testing. Vue analog of the React
 * `@react-router-modules/testing` `renderModule`.
 *
 * Supports route-based modules (with `createRoutes`), entry-point modules, and
 * legacy component-only modules (with `component`, no routes).
 *
 * Deviations from the React source, both forced by the framework:
 *
 * - Returns a `@vue/test-utils` `VueWrapper` (the repo-wide Vue test primitive)
 *   rather than a `@testing-library/react` `RenderResult`. `mount` is the Vue
 *   analog of `render`.
 * - The `createRoutes` path boots a memory-history router, installs it as a
 *   plugin, and renders `<RouterView>`. vue-router resolves navigation
 *   asynchronously, so the helper awaits `router.isReady()` + `flushPromises()`
 *   before returning — the React `createMemoryRouter` path resolves without an
 *   explicit await.
 */
export async function renderModule<TSharedDependencies extends Record<string, any>>(
  module: ModuleDescriptor<TSharedDependencies>,
  options: RenderModuleOptions<TSharedDependencies>,
): Promise<VueWrapper> {
  const { stores, services, reactiveServices } = separateDeps(
    options.deps as Record<string, unknown>,
  );
  const moduleEntry = buildModuleEntry(module);
  let slots: SlotMap = options.slots ?? {};

  // Evaluate dynamic slots if the module has them, reusing the same flat-deps
  // snapshot contract the runtime uses at resolve() time (store state,
  // reactive-service snapshots, services passed through).
  if (module.dynamicSlots) {
    const flatDeps = buildDepsSnapshot<Record<string, unknown>>({
      stores,
      services,
      reactiveServices,
    });

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

  if (options.entry) {
    const entryPoint = module.entryPoints?.[options.entry];
    if (!entryPoint) {
      throw new Error(
        `[@modular-vue/testing] Module "${module.id}" has no entry "${options.entry}".`,
      );
    }
    const Component = (entryPoint as { component: unknown }).component as Parameters<typeof h>[0];
    const exitSpy = options.exit ?? (() => {});
    return mountModuleTree(() => h(Component, { input: options.input, exit: exitSpy }), {
      stores,
      services,
      reactiveServices,
      slots,
      moduleEntry,
    });
  }

  if (module.createRoutes) {
    const moduleRoutes = module.createRoutes();
    const routes: RouteRecordRaw[] = Array.isArray(moduleRoutes) ? moduleRoutes : [moduleRoutes];

    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push(options.route ?? "/");

    const wrapper = mountModuleTree(() => h(RouterView), {
      stores,
      services,
      reactiveServices,
      slots,
      moduleEntry,
      plugins: [router],
    });
    await router.isReady();
    await flushPromises();
    return wrapper;
  }

  if (module.component) {
    const Component = module.component as Parameters<typeof h>[0];

    return mountModuleTree(() => h(Component, { ...options.props }), {
      stores,
      services,
      reactiveServices,
      slots,
      moduleEntry,
    });
  }

  throw new Error(
    `[@modular-vue/testing] Module "${module.id}" has neither createRoutes nor component. ` +
      "renderModule requires at least one of these.",
  );
}
