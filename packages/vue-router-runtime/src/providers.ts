import {
  defineComponent,
  h,
  provide,
  shallowRef,
  type App,
  type Component,
  type Plugin,
} from "vue";
import { buildDepsSnapshot, evaluateDynamicSlots } from "@modular-frontend/core";
import type {
  DynamicSlotFactory,
  ModuleEntry,
  NavigationItemBase,
  NavigationManifest,
  ReactiveService,
  SlotFilter,
  Store,
} from "@modular-frontend/core";
import {
  DynamicSlotsProvider,
  modulesKey,
  navigationKey,
  recalculateSlotsKey,
  sharedDependenciesKey,
  slotsKey,
  type SlotsSignal,
} from "@modular-vue/vue";

/**
 * Everything the provider layer needs to install the modular-vue injection
 * contexts — shared deps, navigation, modules, slots (static or dynamic), and
 * the recalculate trigger. Assembled once by the registry and shared by both
 * the router-owning plugin ({@link createModularProvidersPlugin}) and the
 * framework-mode component ({@link createModularProvidersComponent}).
 *
 * Analog of the React `ProvidersProps` in `react-router-runtime/providers.tsx`.
 */
export interface ModularProvidersConfig {
  stores: Record<string, Store<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  navigation: NavigationManifest<NavigationItemBase>;
  slots: object;
  modules: readonly ModuleEntry[];
  dynamicSlotFactories: DynamicSlotFactory[];
  slotFilter?: SlotFilter;
  slotsSignal: SlotsSignal;
  recalculateSlots: () => void;
}

function hasDynamicSlots(config: ModularProvidersConfig): boolean {
  return config.dynamicSlotFactories.length > 0 || config.slotFilter != null;
}

/**
 * Recompute the resolved slot manifest from the current dependency snapshot.
 * Same contract the `DynamicSlotsProvider` component uses — reads store state
 * and reactive-service snapshots, passes plain services through, then applies
 * the factories and optional filter.
 */
function computeDynamicSlots(config: ModularProvidersConfig): object {
  const deps = buildDepsSnapshot<Record<string, unknown>>({
    stores: config.stores,
    services: config.services,
    reactiveServices: config.reactiveServices,
  });
  return evaluateDynamicSlots(
    config.slots as any,
    config.dynamicSlotFactories,
    deps,
    config.slotFilter,
  );
}

function provideSharedDeps(app: App, config: ModularProvidersConfig): void {
  app.provide(sharedDependenciesKey, {
    stores: config.stores,
    services: config.services,
    reactiveServices: config.reactiveServices,
  });
  app.provide(navigationKey, config.navigation);
  app.provide(modulesKey, config.modules);
  app.provide(recalculateSlotsKey, config.recalculateSlots);
}

/**
 * Builds the app-level Vue plugin the router-owning `resolve()` returns.
 *
 * Where the React runtime wraps a `<RouterProvider />` in a provider component
 * tree, the Vue app root is the user's own component rendering `<router-view>`,
 * so the contexts are installed app-wide with `app.provide` — every
 * `<router-view>`-mounted module component then injects them. Dynamic slots are
 * wired at install time: a `shallowRef` holds the resolved slots and the
 * registry's `slotsSignal` recomputes it on every `recalculateSlots()`. The
 * subscription lives for the app's lifetime by design (no scope to dispose at
 * the app root), matching how the manifest itself outlives any single view.
 *
 * `userPlugins` are installed after the modular contexts so they can depend on
 * them, mirroring the React `providers` array (first element outermost).
 */
export function createModularProvidersPlugin(
  config: ModularProvidersConfig,
  userPlugins?: Plugin[],
): { install: (app: App) => void } {
  return {
    install(app: App) {
      provideSharedDeps(app, config);

      if (hasDynamicSlots(config)) {
        const slotsRef = shallowRef(computeDynamicSlots(config));
        config.slotsSignal.subscribe(() => {
          slotsRef.value = computeDynamicSlots(config);
        });
        app.provide(slotsKey, slotsRef);
      } else {
        app.provide(slotsKey, shallowRef(config.slots));
      }

      if (userPlugins) {
        for (const plugin of userPlugins) app.use(plugin);
      }
    },
  };
}

/**
 * Builds the framework-mode `Providers` component the host wraps around its own
 * tree when it owns the router (the analog of React's `createProvidersComponent`).
 *
 * Children render inside the full modular-vue context tree. Dynamic slots route
 * through the shared `DynamicSlotsProvider` component so the reactive
 * recompute/subscribe/dispose logic stays in one place. `userProviders` are Vue
 * components wrapped around the context stack, first element outermost.
 */
export function createModularProvidersComponent(
  config: ModularProvidersConfig,
  userProviders?: Component[],
): Component {
  const dynamic = hasDynamicSlots(config);
  // Reverse once at factory time so applying providers back-to-front leaves the
  // first entry outermost (matching the documented order).
  const providersInnerFirst = userProviders ? [...userProviders].reverse() : undefined;

  return defineComponent({
    name: "ModularProviders",
    setup(_props, { slots: renderSlots }) {
      provide(sharedDependenciesKey, {
        stores: config.stores,
        services: config.services,
        reactiveServices: config.reactiveServices,
      });
      provide(navigationKey, config.navigation);
      provide(modulesKey, config.modules);
      provide(recalculateSlotsKey, config.recalculateSlots);
      // Static slots are provided here; dynamic slots are provided by the
      // nested DynamicSlotsProvider in the render function below.
      if (!dynamic) provide(slotsKey, shallowRef(config.slots));

      return () => {
        const children = () => renderSlots.default?.();
        let node = dynamic
          ? h(
              DynamicSlotsProvider,
              {
                baseSlots: config.slots,
                factories: config.dynamicSlotFactories,
                filter: config.slotFilter,
                stores: config.stores,
                services: config.services,
                reactiveServices: config.reactiveServices,
                signal: config.slotsSignal,
              },
              children,
            )
          : children();

        if (providersInnerFirst) {
          for (const Provider of providersInnerFirst) {
            const inner = node;
            node = h(Provider, null, () => inner);
          }
        }

        return node;
      };
    },
  });
}
