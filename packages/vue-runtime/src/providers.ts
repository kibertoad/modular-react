import {
  defineComponent,
  effectScope,
  h,
  provide,
  shallowRef,
  type App,
  type Component,
  type InjectionKey,
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
  reactiveSlotsKey,
  recalculateSlotsKey,
  resolveReactiveSlots,
  sharedDependenciesKey,
  slotsKey,
  type AppProvide,
  type ReactiveSlotsInput,
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
  /**
   * App-level injection bindings contributed by plugins via their `appProvides`
   * hook (e.g. the journeys plugin's `journeyKey` → runtime). Applied by the
   * router-owning plugin form ({@link createModularProvidersPlugin}) via
   * `app.provide` — the install-mode counterpart of the wrapping components the
   * framework-mode form receives as `userProviders`. Empty when no plugin
   * contributes any.
   */
  pluginAppProvides: readonly AppProvide[];
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

/**
 * The evaluation inputs the reactive slots source ({@link resolveReactiveSlots})
 * needs: the base slots, factories and filter, plus the three dependency buckets
 * the snapshot is rebuilt from inside the tracked `computed`.
 */
function reactiveSlotsInput(config: ModularProvidersConfig): ReactiveSlotsInput {
  return {
    baseSlots: config.slots,
    factories: config.dynamicSlotFactories,
    filter: config.slotFilter,
    stores: config.stores,
    services: config.services,
    reactiveServices: config.reactiveServices,
  };
}

/**
 * Provide the four always-present modular contexts through either the app-level
 * `app.provide` (plugin form) or the component-scoped `provide` (component
 * form). Keeps the context set enumerated in one place so both forms expose an
 * identical injection surface.
 *
 * The reactive-slots source ({@link reactiveSlotsKey}) is provided separately by
 * each form: its resolved `computed` needs an owning effect scope, which differs
 * between the app-level plugin (an explicit `effectScope`) and the component
 * (its own `setup` scope).
 */
function provideModularContexts(
  provideFn: <T>(key: InjectionKey<T>, value: T) => void,
  config: ModularProvidersConfig,
): void {
  provideFn(sharedDependenciesKey, {
    stores: config.stores,
    services: config.services,
    reactiveServices: config.reactiveServices,
  });
  provideFn(navigationKey, config.navigation);
  provideFn(modulesKey, config.modules);
  provideFn(recalculateSlotsKey, config.recalculateSlots);
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
 * subscription is disposed on `app.onUnmount`, so installing the manifest on
 * more than one app (SSR, multiple roots) doesn't leak a listener per install.
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
      provideModularContexts((key, value) => app.provide(key, value), config);

      // Plugin-contributed app-level bindings (e.g. the journeys runtime under
      // `journeyKey`). The framework-mode component form receives the same
      // plugins' wrapping components instead; here there is no root to wrap, so
      // the plugin's `appProvides` bindings are the vehicle. Applied after the
      // core contexts so a plugin could, in principle, read them — and before
      // user plugins, which may depend on plugin context.
      for (const { key, value } of config.pluginAppProvides) {
        app.provide(key, value);
      }

      if (hasDynamicSlots(config)) {
        const slotsRef = shallowRef(computeDynamicSlots(config));
        const unsubscribe = config.slotsSignal.subscribe(() => {
          slotsRef.value = computeDynamicSlots(config);
        });
        // Dispose on app unmount so a manifest installed on more than one app
        // doesn't leak a subscription per install into the shared slotsSignal.
        app.onUnmount(unsubscribe);
        app.provide(slotsKey, slotsRef);
      } else {
        app.provide(slotsKey, shallowRef(config.slots));
      }

      // Reactive path: one shared `computed` resolved once, read by every
      // `useReactiveSlots()` consumer. Owned by a detached `effectScope` stopped
      // on app unmount so the computed's effect doesn't outlive the app (same
      // multi-install hygiene as the signal subscription above).
      const reactiveScope = effectScope(true);
      const reactiveSlots = reactiveScope.run(() =>
        resolveReactiveSlots(reactiveSlotsInput(config)),
      )!;
      app.onUnmount(() => reactiveScope.stop());
      app.provide(reactiveSlotsKey, reactiveSlots);

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
      provideModularContexts((key, value) => provide(key, value), config);
      // Static slots are provided here; dynamic slots are provided by the
      // nested DynamicSlotsProvider in the render function below.
      if (!dynamic) provide(slotsKey, shallowRef(config.slots));
      // Reactive path: the one shared `computed` every `useReactiveSlots()`
      // consumer reads. Created in this component's `setup` scope, so its effect
      // is disposed when ModularProviders unmounts (no explicit scope needed).
      provide(reactiveSlotsKey, resolveReactiveSlots(reactiveSlotsInput(config)));

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
