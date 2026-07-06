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
import type { SlotsSignal } from "@modular-vue/vue";
import type { ModuleDescriptor, LazyModuleDescriptor } from "@modular-vue/core";
import type { ResolveManifestOptions, ResolvedManifest } from "./types.js";

/**
 * Registry surface produced by `createRegistry`. Plugins attach via
 * {@link ModuleRegistry.use} — each `use` call returns `this` intersected
 * with the plugin's `extend` surface, so TypeScript sees plugin-contributed
 * methods (e.g. a future `registerJourney`) on the returned reference.
 *
 * `TPlugins` tracks the current plugin tuple so `manifest.extensions` /
 * `manifest.journeys` are typed against plugin outputs after `resolveManifest`.
 *
 * This is the PR-21 (registry) surface. The router-owning `resolve()` entry and
 * the `Providers` context component land in PR-22, together with the
 * route-builder that grafts module routes via `router.addRoute()`.
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
   * list of fields ignored at lazy-load time. The route-builder that grafts
   * the loaded subtree in via `router.addRoute()` lands in PR-22.
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
   * Resolve all modules and produce the resolved manifest: the navigation
   * manifest, resolved slots, module entries + descriptors, and any plugin
   * extensions. Does NOT create or own a router.
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
 * Internal — the resolved assembly shared by the current (and future) entry
 * points. Computed once, cached.
 *
 * `resolveManifest()` reads only `modules` / `moduleDescriptors` / `navigation`
 * / `slots` / `extensions` / `recalculateSlots` off this shape. The remaining
 * fields — `stores`, `services`, `reactiveServices`, `dynamicSlotFactories`,
 * `slotsSignal`, `slotFilter` — are inert in PR-21: they feed the provider
 * stack and dynamic-slots wiring that PR-22 adds. They are assembled here (not
 * deferred to PR-22) so PR-22 threads the same store maps and the same signal
 * instance the `recalculateSlots` closure notifies, keeping the assembly the
 * single source of truth across both entry points.
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
        "[@modular-vue/runtime] Cannot register modules after resolveManifest() has been called.",
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

    // Lazy modules are accepted and checked for duplicate IDs, but the
    // route-builder that grafts their subtree via `router.addRoute()` lands in
    // PR-22. Until then a registered lazy module contributes nothing to the
    // resolved manifest — no routes, no nav, no descriptor — so warn rather
    // than let it vanish silently.
    if (lazyModules.length > 0 && isDevEnv()) {
      console.warn(
        `[@modular-vue/runtime] ${lazyModules.length} lazy module(s) registered ` +
          `(${lazyModules.map((m) => `"${m.id}"`).join(", ")}), but lazy-module routing is not wired ` +
          `until PR-22. They are validated for duplicate IDs but contribute nothing to this manifest.`,
      );
    }

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
    // name. `debug` matches a plugin's own environment-based default
    // (NODE_ENV !== "production") so a plugin that respects the flag gets
    // verbose dev output without an explicit opt-in.
    const extensions: Record<string, unknown> = {};
    const debug = isDevEnv();
    for (const plugin of plugins) {
      const runtime = plugin.onResolve?.({
        modules: modules as BaseModuleDescriptor[],
        moduleDescriptors,
        debug,
      });
      extensions[plugin.name] = runtime;
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
    };
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

    resolveManifest(
      options?: ResolveManifestOptions<TSharedDependencies, TSlots>,
    ): ResolvedManifest<TSlots, TNavItem, Record<string, unknown>> {
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

      registrationLocked = true;

      const assembly = buildAssembly({ slotFilter: capturedOptions?.slotFilter });

      cachedManifest = {
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
