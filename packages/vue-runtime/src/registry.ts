import {
  buildDepsSnapshot,
  buildNavigationManifest,
  buildSlotsManifest,
  collectDynamicSlotFactories,
  isDevEnv,
  validateNoDuplicateIds,
  validateDependencies,
  validateEntryExitShape,
} from "@modular-frontend/core";
import type {
  ModuleDescriptor as BaseModuleDescriptor,
  LazyModuleDescriptor as BaseLazyModuleDescriptor,
  NavigationItem,
  NavigationItemBase,
  NavigationManifest,
  ModuleEntry,
  ReactiveService,
  RegistryConfig,
  RegistryPlugin,
  PluginRuntimesOf,
  SlotFilter,
  SlotMap,
  SlotMapOf,
  Store,
} from "@modular-frontend/core";
import { createSlotsSignal } from "@modular-vue/vue";
import type { AppProvide, SlotsSignal, VueAppProvidingPlugin } from "@modular-vue/vue";
import type { Component } from "vue";
import type { RouteRecordRaw } from "vue-router";
import type { ModuleDescriptor, LazyModuleDescriptor } from "@modular-vue/core";
import type {
  ApplicationManifest,
  ResolveManifestOptions,
  ResolveOptions,
  ResolvedManifest,
} from "./types.js";
import { collectEagerRoutes, graftModuleRoutes } from "./route-builder.js";
import {
  createModularProvidersComponent,
  createModularProvidersPlugin,
  type ModularProvidersConfig,
} from "./providers.js";

/**
 * Registry surface produced by `createRegistry`. Plugins attach via
 * {@link ModuleRegistry.use} — each `use` call returns `this` intersected
 * with the plugin's `extend` surface, so TypeScript sees plugin-contributed
 * methods (e.g. a future `registerJourney`) on the returned reference.
 *
 * `TPlugins` tracks the current plugin tuple so `manifest.extensions` /
 * `manifest.journeys` are typed against plugin outputs after `resolve` /
 * `resolveManifest`.
 */
export interface ModuleRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
  TPlugins extends readonly RegistryPlugin<string, any, any>[] = readonly [],
> {
  /**
   * Register an eager module. The module's `TNavItem` must match the
   * registry's — pass the same alias (e.g. `AppNavItem`) on both sides so
   * typed i18n labels, typed dynamic-href context, and typed `meta` are
   * enforced end-to-end.
   */
  register(module: ModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>): void;

  /**
   * Register a lazily-loaded module. Only `createRoutes()` on the loaded
   * descriptor is honored — see {@link LazyModuleDescriptor} for the complete
   * list of fields ignored at lazy-load time. The router-owning `resolve()`
   * grafts the loaded subtree in via `router.addRoute()` on first visit.
   */
  registerLazy(descriptor: LazyModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>): void;

  /**
   * Attach a plugin. The plugin's `extend` return is intersected onto the
   * returned registry type — methods and state contributed by the plugin
   * become callable on the same reference. The registry is mutated in place
   * and the return value is the same object, typed wider.
   *
   * Must be called before `resolveManifest()`. Plugin name collisions and
   * method-name collisions throw loud.
   */
  use<TPlugin extends RegistryPlugin<string, any, any>>(
    plugin: TPlugin,
  ): ModuleRegistry<TSharedDependencies, TSlots, TNavItem, readonly [...TPlugins, TPlugin]> &
    (TPlugin extends RegistryPlugin<any, infer TExt, any> ? TExt : object);

  /**
   * Resolve all modules and produce the application manifest: an installable
   * Vue plugin (`app.use(manifest)`) that wires the modular contexts, plus the
   * router with every module's `createRoutes()` subtree grafted on via
   * `router.addRoute()` and the optional auth guard installed. Single-use —
   * throws on a second call, and cannot be mixed with `resolveManifest()`.
   */
  resolve(
    options: ResolveOptions<TSharedDependencies, TSlots>,
  ): ApplicationManifest<TSlots, TNavItem, PluginRuntimesOf<TPlugins>>;

  /**
   * Resolve all modules for framework-mode integrations (the host owns the
   * router). Returns a `Providers` component wrapping the full context stack,
   * the eager module `routes` to spread into your own `createRouter`, the
   * navigation manifest, resolved slots, module entries + descriptors, and any
   * plugin extensions. Does NOT create or own a router.
   *
   * Idempotent — may be called multiple times (e.g. from a routes module and a
   * root layout). The first call does all work and caches the result; later
   * calls return the cached manifest and must pass no options.
   */
  resolveManifest(
    options?: ResolveManifestOptions<TSharedDependencies, TSlots>,
  ): ResolvedManifest<TSlots, TNavItem, PluginRuntimesOf<TPlugins>>;
}

/**
 * Internal — everything `resolve()` / `resolveManifest()` need that doesn't
 * depend on whether the runtime owns a router. Computed once, cached, and
 * shared across both entry points so the provider stack, the store maps, and
 * the `slotsSignal` the `recalculateSlots` closure notifies are the same
 * instances everywhere.
 */
interface CommonAssembly<
  TSlots extends SlotMapOf<TSlots>,
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  modules: readonly ModuleEntry[];
  moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  navigation: NavigationManifest<TNavItem>;
  slots: TSlots;
  stores: Record<string, Store<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  dynamicSlotFactories: ReturnType<typeof collectDynamicSlotFactories>;
  slotsSignal: SlotsSignal;
  recalculateSlots: () => void;
  slotFilter: SlotFilter | undefined;
  extensions: Record<string, unknown>;
  /**
   * Wrapping provider components contributed by plugins via `plugin.providers()`
   * (e.g. the journeys plugin's `<JourneyProvider>`), in plugin-registration
   * order. Threaded after user-supplied providers in the framework-mode
   * component form (`resolveManifest`) — the Vue analog of the React runtime's
   * `combinedProviders`. See the `resolve()` note on why the router-owning
   * plugin form does not consume these.
   */
  pluginProviders: Component[];
  /**
   * App-level injection bindings contributed by plugins via the Vue-specific
   * `appProvides` hook ({@link VueAppProvidingPlugin}), in plugin-registration
   * order. Applied via `app.provide` by the router-owning `resolve()` plugin
   * form — the install-mode counterpart of `pluginProviders`. The framework-mode
   * component form uses `pluginProviders` (wrapping components) instead, so it
   * does not consume these.
   */
  pluginAppProvides: AppProvide[];
}

export function createRegistry<
  TSharedDependencies extends Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
  TNavItem extends NavigationItemBase = NavigationItem,
>(
  config: RegistryConfig<TSharedDependencies, TSlots>,
): ModuleRegistry<TSharedDependencies, TSlots, TNavItem, readonly []> {
  const modules: ModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>[] = [];
  const lazyModules: LazyModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>[] = [];
  const plugins: RegistryPlugin<string, any, any>[] = [];
  const seenPluginNames = new Set<string>();

  // A registry commits to one mode on first resolve:
  //   - "resolve"          → library owns the router; single-use
  //   - "resolveManifest"  → host owns the router; idempotent
  //   - null               → neither has been called yet
  type Mode = "resolve" | "resolveManifest";
  let mode: Mode | null = null;
  let registrationLocked = false;

  // Cached manifest — populated on the first resolveManifest() call so later
  // calls from a second site return the same manifest.
  let cachedManifest: ResolvedManifest<TSlots, TNavItem, Record<string, unknown>> | null = null;

  // Options captured from the first resolveManifest() invocation, honored by
  // every subsequent call (including retries after a failed buildAssembly). We
  // commit to "there has been a first call" *before* anything that can throw —
  // otherwise a first call that throws in buildAssembly would leave
  // `cachedManifest` null and let a retry slip different options past the
  // "options may only be passed on the first call" guard.
  let firstCallCompleted = false;
  let capturedOptions: ResolveManifestOptions<TSharedDependencies, TSlots> | undefined = undefined;

  // onRegister must run at most once per module for the lifetime of the
  // registry — modules commonly use it to subscribe to stores or register
  // side-effects against a framework singleton, and double-firing would
  // double-register those. Tracked independently of cachedManifest because
  // cachedManifest is only populated on *successful* manifest build: if
  // buildAssembly throws after onRegister ran, a retry would otherwise walk the
  // hooks a second time.
  let onRegisterRan = false;

  const availableKeys = new Set<string>([
    ...Object.keys(config.stores ?? {}),
    ...Object.keys(config.services ?? {}),
    ...Object.keys(config.reactiveServices ?? {}),
  ]);

  function assertCanRegister() {
    if (registrationLocked) {
      throw new Error(
        "[@modular-vue/runtime] Cannot register modules after resolve() or resolveManifest() has been called.",
      );
    }
  }

  function buildAssembly(options: {
    slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;
  }): CommonAssembly<TSlots, TNavItem> {
    validateNoDuplicateIds(
      modules as BaseModuleDescriptor[],
      lazyModules as BaseLazyModuleDescriptor[],
    );
    validateDependencies(modules as BaseModuleDescriptor[], availableKeys);
    validateEntryExitShape(modules as BaseModuleDescriptor[]);

    for (const plugin of plugins) {
      plugin.validate?.({ modules: modules as BaseModuleDescriptor[] });
    }

    if (!onRegisterRan) {
      const deps = buildDepsSnapshot<TSharedDependencies>(config);
      for (const mod of modules) {
        try {
          mod.lifecycle?.onRegister?.(deps);
        } catch (err) {
          // Flip the flag before throwing so a retry doesn't re-walk hooks that
          // may have already run for earlier modules before this one threw. A
          // half-registered state is still better than a double-registered one.
          onRegisterRan = true;
          throw new Error(
            `[@modular-vue/runtime] Module "${mod.id}" lifecycle.onRegister() failed: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          );
        }
      }
      onRegisterRan = true;
    }

    // Collect plugin-contributed nav items before building the manifest so they
    // participate in the same sort / group logic as module items. Plugins only
    // see the structural `NavigationItemBase` bound, so the returned items are
    // widened to `TNavItem` at the assembly boundary.
    const pluginNavItems: NavigationItemBase[] = [];
    for (const plugin of plugins) {
      const contributed = plugin.contributeNavigation?.({
        modules: modules as BaseModuleDescriptor[],
      });
      if (contributed && contributed.length > 0) pluginNavItems.push(...contributed);
    }
    const navigation = buildNavigationManifest<TNavItem>(
      modules,
      pluginNavItems as unknown as readonly TNavItem[],
    );
    const slots = buildSlotsManifest<TSlots>(modules, config.slots);
    const dynamicSlotFactories = collectDynamicSlotFactories(modules as BaseModuleDescriptor[]);
    const slotFilter = options.slotFilter as SlotFilter | undefined;

    const stores: Record<string, Store<unknown>> = {};
    const services: Record<string, unknown> = {};
    const reactiveServices: Record<string, ReactiveService<unknown>> = {};

    if (config.stores) {
      for (const [key, store] of Object.entries(config.stores)) {
        if (store) stores[key] = store as Store<unknown>;
      }
    }
    if (config.services) {
      for (const [key, service] of Object.entries(config.services)) {
        if (service !== undefined) services[key] = service;
      }
    }
    if (config.reactiveServices) {
      for (const [key, rs] of Object.entries(config.reactiveServices)) {
        if (rs) reactiveServices[key] = rs as ReactiveService<unknown>;
      }
    }

    const slotsSignal = createSlotsSignal();
    const hasDynamicSlots = dynamicSlotFactories.length > 0 || slotFilter != null;
    const recalculateSlots = hasDynamicSlots ? () => slotsSignal.notify() : () => {};

    const moduleDescriptors: Record<string, ModuleDescriptor<any, any, any, any>> = {};
    for (const mod of modules) moduleDescriptors[mod.id] = mod;

    // Plugin onResolve: collect each plugin's runtime into `extensions` keyed by
    // name, and each plugin's wrapping provider components into `pluginProviders`
    // (applied after the user-supplied providers in framework mode). `debug`
    // matches a plugin's own environment-based default (NODE_ENV !==
    // "production") so a plugin that respects the flag gets verbose dev output
    // without an explicit opt-in.
    const extensions: Record<string, unknown> = {};
    const pluginProviders: Component[] = [];
    const pluginAppProvides: AppProvide[] = [];
    const debug = isDevEnv();
    for (const plugin of plugins) {
      const runtime = plugin.onResolve?.({
        modules: modules as BaseModuleDescriptor[],
        moduleDescriptors,
        debug,
      });
      extensions[plugin.name] = runtime;
      const contributed = plugin.providers?.({ runtime });
      if (contributed && contributed.length > 0) {
        // Plugin providers are typed to the neutral `UiComponent` seam; in Vue a
        // UiComponent is a Vue component, so the cast is a no-op at runtime.
        pluginProviders.push(...(contributed as unknown as Component[]));
      }
      // Vue-specific `appProvides` hook (not on the neutral `RegistryPlugin`):
      // app-level bindings for the router-owning install path. A plugin that
      // doesn't implement it contributes nothing.
      const appProvides = (plugin as Partial<VueAppProvidingPlugin>).appProvides?.({ runtime });
      if (appProvides && appProvides.length > 0) {
        pluginAppProvides.push(...appProvides);
      }
    }

    return {
      modules: modules.map((mod) => ({
        id: mod.id,
        version: mod.version,
        meta: mod.meta,
        component: mod.component,
        zones: mod.zones,
      })),
      moduleDescriptors,
      navigation,
      slots,
      stores,
      services,
      reactiveServices,
      dynamicSlotFactories,
      slotsSignal,
      recalculateSlots,
      slotFilter,
      extensions,
      pluginProviders,
      pluginAppProvides,
    };
  }

  /**
   * Project the shared assembly onto the config the provider layer consumes.
   * `TNavItem extends NavigationItemBase`, so the narrowed navigation manifest
   * widens cleanly; `slots` is the resolved `TSlots` treated as a plain object.
   */
  function toProvidersConfig(assembly: CommonAssembly<TSlots, TNavItem>): ModularProvidersConfig {
    return {
      stores: assembly.stores,
      services: assembly.services,
      reactiveServices: assembly.reactiveServices,
      navigation: assembly.navigation,
      slots: assembly.slots as object,
      modules: assembly.modules,
      dynamicSlotFactories: assembly.dynamicSlotFactories,
      slotFilter: assembly.slotFilter,
      slotsSignal: assembly.slotsSignal,
      recalculateSlots: assembly.recalculateSlots,
      pluginAppProvides: assembly.pluginAppProvides,
    };
  }

  /**
   * Collect only the eager module route records for framework mode, where the
   * host owns the router and spreads these into its own `createRouter`. Lazy
   * modules are excluded — grafting their subtree needs a router reference,
   * which only the router-owning `resolve()` has.
   */
  function buildModuleRoutesOnly(): RouteRecordRaw[] {
    return collectEagerRoutes(modules as ModuleDescriptor<any, any, any, any>[]);
  }

  // Build the base registry object. Plugin `extend` merges onto it in-place when
  // `use()` is called; the public return is the same reference, retyped.
  const registry: Record<string, unknown> = {
    register(module: ModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>) {
      assertCanRegister();
      modules.push(module);
    },

    registerLazy(descriptor: LazyModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>) {
      assertCanRegister();
      lazyModules.push(descriptor);
    },

    use(plugin: RegistryPlugin<string, any, any>) {
      assertCanRegister();
      if (seenPluginNames.has(plugin.name)) {
        throw new Error(
          `[@modular-vue/runtime] Duplicate plugin name "${plugin.name}" — each plugin may be registered at most once.`,
        );
      }

      // Fully resolve the plugin's contribution before mutating registry
      // bookkeeping, so a throw in extend() or a method collision leaves the
      // registry clean and the caller can retry with a fixed plugin.
      //
      // `markDirty` is reserved by the plugin contract for future reactivity
      // support; plugins may call it when internal state changes, but today it
      // is a no-op by design.
      const extension = plugin.extend({ markDirty: () => {} });
      const entries = Object.entries(extension);
      for (const [key] of entries) {
        // Own-property check only — `key in registry` would also match names
        // inherited from Object.prototype (`toString`, `hasOwnProperty`,
        // `valueOf`, ...), falsely rejecting a plugin that contributes a method
        // by one of those names when no registry method actually owns it.
        if (Object.hasOwn(registry, key)) {
          throw new Error(
            `[@modular-vue/runtime] Plugin "${plugin.name}" attempted to overwrite registry method "${key}".`,
          );
        }
      }

      seenPluginNames.add(plugin.name);
      plugins.push(plugin);
      for (const [key, value] of entries) {
        registry[key] = value;
      }
      return registry as unknown as ModuleRegistry<TSharedDependencies, TSlots, TNavItem, any>;
    },

    resolve(
      options: ResolveOptions<TSharedDependencies, TSlots>,
    ): ApplicationManifest<TSlots, TNavItem, Record<string, unknown>> {
      if (mode === "resolveManifest") {
        throw new Error(
          "[@modular-vue/runtime] resolve() cannot be called after resolveManifest() — the registry is already in framework-mode.",
        );
      }
      if (mode === "resolve") {
        throw new Error("[@modular-vue/runtime] resolve() can only be called once.");
      }

      // Build the assembly BEFORE committing to resolve-mode: a recoverable
      // validation / dependency / onRegister failure must leave the registry
      // retryable (matching resolveManifest's semantics), not permanently
      // bricked. Only once assembly succeeds do we lock the mode — the grafting
      // below mutates the live router and can't be safely retried, so a throw
      // there correctly leaves the single-use registry closed.
      const assembly = buildAssembly({ slotFilter: options.slotFilter });

      mode = "resolve";
      registrationLocked = true;

      // Graft every module's route subtree onto the host-created router, then
      // install the auth guard. vue-router registers routes at runtime, so no
      // frozen-tree composition or pathless-layout trick is needed.
      graftModuleRoutes(
        options.router,
        modules as ModuleDescriptor<any, any, any, any>[],
        lazyModules as LazyModuleDescriptor<any, any, any, any>[],
        { parentName: options.parentRouteName },
      );
      if (options.authGuard) {
        options.router.beforeEach(options.authGuard);
      }

      // Plugin-contributed WRAPPING COMPONENTS (`assembly.pluginProviders`) are
      // not threaded here — they need a library-owned root to wrap, and the
      // router-owning path returns an installable Vue plugin whose app root is
      // the user's own `<router-view>` shell. Plugins that need app-level context
      // in this mode contribute it via their `appProvides` hook instead
      // (`assembly.pluginAppProvides`), which `createModularProvidersPlugin`
      // applies with `app.provide` — so e.g. the journeys runtime reaches
      // `<JourneyOutlet>` through `journeyKey` without the shell hand-wiring
      // `<JourneyProvider>`. The framework-mode `resolveManifest()` path owns a
      // `Providers` component and threads the wrapping components automatically.
      const plugin = createModularProvidersPlugin(toProvidersConfig(assembly), options.providers);

      return {
        install: plugin.install,
        router: options.router,
        navigation: assembly.navigation,
        slots: assembly.slots,
        modules: assembly.modules,
        moduleDescriptors: assembly.moduleDescriptors,
        extensions: assembly.extensions,
        // See the matching comment in resolveManifest() — the public `.journeys`
        // type comes from `PluginRuntimesOf<TPlugins>` via the outer cast.
        journeys: assembly.extensions.journeys as never,
        onModuleExit: options.onModuleExit,
        recalculateSlots: assembly.recalculateSlots,
      };
    },

    resolveManifest(
      options?: ResolveManifestOptions<TSharedDependencies, TSlots>,
    ): ResolvedManifest<TSlots, TNavItem, Record<string, unknown>> {
      if (mode === "resolve") {
        throw new Error(
          "[@modular-vue/runtime] resolveManifest() cannot be called after resolve() — the registry already owns a router.",
        );
      }

      if (firstCallCompleted) {
        // Idempotent: first call captured options; later calls must pass none.
        // Enforced here (rather than gated on `cachedManifest`) so that a retry
        // after a failed first call can't slip different options past the guard
        // — the captured options win either way.
        if (options !== undefined) {
          throw new Error(
            "[@modular-vue/runtime] resolveManifest() has already been called — options may only be passed on the first call. Extract the manifest into a shared module and import it from both sites.",
          );
        }
        if (cachedManifest) return cachedManifest;
        // Fall through: first call threw before producing a manifest; retry
        // using the captured options.
      } else {
        capturedOptions = options;
        firstCallCompleted = true;
      }

      mode = "resolveManifest";
      registrationLocked = true;

      const assembly = buildAssembly({ slotFilter: capturedOptions?.slotFilter });

      // Framework mode doesn't own the router, so lazy modules can't self-graft
      // their subtree (that needs a router reference). Warn rather than let a
      // registered lazy module vanish silently — use resolve() to wire them.
      if (lazyModules.length > 0 && isDevEnv()) {
        console.warn(
          `[@modular-vue/runtime] ${lazyModules.length} lazy module(s) registered ` +
            `(${lazyModules.map((m) => `"${m.id}"`).join(", ")}), but lazy-module routing is not wired ` +
            `in framework mode (resolveManifest). Use resolve() to own the router and graft lazy modules ` +
            `via router.addRoute() on first visit.`,
        );
      }

      // Plugin-contributed providers (e.g. the journeys plugin's
      // <JourneyProvider>) are wrapping components, so they compose onto the
      // framework-mode component form. They go AFTER the user-supplied providers
      // (first element outermost) — the Vue analog of the React runtime's
      // `combinedProviders = [...options.providers, ...pluginProviders]` — so a
      // journey outlet mounted inside `<router-view>` reads the journey runtime
      // from context without the shell wiring <JourneyProvider> by hand.
      const combinedProviders =
        capturedOptions?.providers || assembly.pluginProviders.length > 0
          ? [...(capturedOptions?.providers ?? []), ...assembly.pluginProviders]
          : undefined;
      const Providers = createModularProvidersComponent(
        toProvidersConfig(assembly),
        combinedProviders,
      );
      // `manifest.routes` is typed `readonly` — the cached manifest is shared by
      // reference across callsites, so TypeScript is the guard against a
      // callsite mutating the array out from under the other.
      const routes: readonly RouteRecordRaw[] = buildModuleRoutesOnly();

      cachedManifest = {
        Providers,
        routes,
        navigation: assembly.navigation,
        slots: assembly.slots,
        modules: assembly.modules,
        moduleDescriptors: assembly.moduleDescriptors,
        extensions: assembly.extensions,
        // The public `.journeys` type comes from `PluginRuntimesOf<TPlugins>` on
        // the outer `ModuleRegistry` surface; at this site the runtime value is
        // whatever a journeys plugin (if any) wrote into `extensions`.
        journeys: assembly.extensions.journeys as never,
        onModuleExit: capturedOptions?.onModuleExit,
        recalculateSlots: assembly.recalculateSlots,
      };

      return cachedManifest;
    },
  };

  return registry as unknown as ModuleRegistry<TSharedDependencies, TSlots, TNavItem, readonly []>;
}
