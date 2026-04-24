import { createRouter } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import type { StoreApi } from "zustand";
import type {
  ModuleDescriptor,
  LazyModuleDescriptor,
  ReactiveService,
  SlotMap,
  SlotMapOf,
} from "@tanstack-react-modules/core";
import {
  buildNavigationManifest,
  buildSlotsManifest,
  collectDynamicSlotFactories,
  validateNoDuplicateIds,
  validateDependencies,
  validateEntryExitShape,
} from "@modular-react/core";
import type {
  NavigationItem,
  NavigationItemBase,
  PluginRuntimesOf,
  RegistryPlugin,
  SlotFilter,
  NavigationManifest,
  ModuleEntry,
} from "@modular-react/core";
import { createSlotsSignal } from "@modular-react/react";
import type { SlotsSignal } from "@modular-react/react";

import type {
  RegistryConfig,
  ApplicationManifest,
  ResolvedManifest,
  ResolveManifestOptions,
} from "./types.js";
import { buildRouteTree, type RouteBuilderOptions } from "./route-builder.js";
import { createAppComponent } from "./app.js";
import { createProvidersComponent } from "./providers.js";

/**
 * Registry surface produced by `createRegistry`. Plugins attach via
 * {@link ModuleRegistry.use} — each `use` call returns `this` intersected
 * with the plugin's `extend` surface, so TypeScript sees plugin-contributed
 * methods (e.g. `registerJourney`) on the returned reference.
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
   * Register a lazily-loaded module. The loaded descriptor's `component` is
   * rendered at `basePath/$` via TanStack's `lazyRouteComponent`.
   *
   * Not supported in framework mode (`resolveManifest()`).
   */
  registerLazy(descriptor: LazyModuleDescriptor<TSharedDependencies, TSlots, any, TNavItem>): void;

  /**
   * Attach a plugin. The plugin's `extend` return is intersected onto the
   * returned registry type — methods and state contributed by the plugin
   * become callable on the same reference. The registry is mutated in place
   * and the return value is the same object, typed wider.
   *
   * Must be called before `resolve()` / `resolveManifest()`. Plugin name
   * collisions and method-name collisions throw loud.
   */
  use<TPlugin extends RegistryPlugin<string, any, any>>(
    plugin: TPlugin,
  ): ModuleRegistry<TSharedDependencies, TSlots, TNavItem, readonly [...TPlugins, TPlugin]> &
    (TPlugin extends RegistryPlugin<any, infer TExt, any> ? TExt : object);

  /**
   * Resolve all modules and produce the application manifest, including a
   * `<RouterProvider />`-wrapped `App` component and a ready-to-use
   * TanStack `Router`. Single-use — throws on a second call.
   */
  resolve(
    options?: ResolveOptions<TSharedDependencies, TSlots>,
  ): ApplicationManifest<TSlots, TNavItem, PluginRuntimesOf<TPlugins>>;

  /**
   * Resolve all modules for framework-mode integrations. Returns the
   * navigation manifest, resolved slots, module entries, and a `Providers`
   * component that wraps the full context stack. Does NOT create or own a
   * router.
   */
  resolveManifest(
    options?: ResolveManifestOptions<TSharedDependencies, TSlots>,
  ): ResolvedManifest<TSlots, TNavItem, PluginRuntimesOf<TPlugins>>;
}

export interface ResolveOptions<
  TSharedDependencies extends Record<string, any> = Record<string, any>,
  TSlots extends SlotMapOf<TSlots> = SlotMap,
> {
  /** Root layout component (renders <Outlet /> for child routes) */
  rootComponent?: () => React.JSX.Element;

  /**
   * Pre-built root route — if provided, used instead of auto-creating one.
   * Mutually exclusive with rootComponent/notFoundComponent/beforeLoad.
   */
  rootRoute?: AnyRoute;

  /** Component for the index route (/) */
  indexComponent?: () => React.JSX.Element;

  /** Component for 404 / not-found */
  notFoundComponent?: () => React.JSX.Element;

  /**
   * Called before every route loads — for observability, analytics, feature flags.
   * Runs for ALL routes including public ones like /login.
   * Ignored if rootRoute is provided.
   */
  beforeLoad?: (ctx: { location: { pathname: string } }) => void | Promise<void>;

  /**
   * Auth boundary — a pathless layout route that guards module routes and
   * the index route. Shell routes sit outside this boundary.
   */
  authenticatedRoute?: {
    /** Auth guard — throw redirect() to deny access */
    beforeLoad: (ctx: { location: { pathname: string } }) => void | Promise<void>;
    /** Layout component for authenticated pages. Defaults to <Outlet />. */
    component?: () => React.JSX.Element;
  };

  /** Additional routes owned by the shell (login, error pages, etc.) */
  shellRoutes?: (parentRoute: AnyRoute) => AnyRoute[];

  /**
   * Additional React providers to wrap around the app tree.
   * First element is outermost.
   */
  providers?: React.ComponentType<{ children: React.ReactNode }>[];

  /**
   * Global filter applied to the fully resolved slot manifest (static + dynamic)
   * on every `recalculateSlots()` call.
   */
  slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;
}

/**
 * Internal — everything `resolve()` / `resolveManifest()` need that doesn't
 * depend on whether a router is created. Computed once, cached, and shared
 * across both entry points so that calling `resolveManifest()` from multiple
 * sites (e.g. a shared registry module imported by `__root.tsx` and
 * elsewhere) yields the same provider stack.
 */
interface CommonAssembly<
  TSlots extends SlotMapOf<TSlots>,
  TNavItem extends NavigationItemBase = NavigationItem,
> {
  modules: readonly ModuleEntry[];
  moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  navigation: NavigationManifest<TNavItem>;
  slots: TSlots;
  stores: Record<string, StoreApi<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
  dynamicSlotFactories: ReturnType<typeof collectDynamicSlotFactories>;
  slotsSignal: SlotsSignal;
  recalculateSlots: () => void;
  slotFilter: SlotFilter | undefined;
  providers: React.ComponentType<{ children: React.ReactNode }>[] | undefined;
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

  // A registry commits to one mode on first call:
  //   - "resolve"          → library owns the router; single-use
  //   - "resolveManifest"  → host owns the router; idempotent
  //   - null               → neither has been called yet
  type Mode = "resolve" | "resolveManifest";
  let mode: Mode | null = null;
  let registrationLocked = false;

  // Cached manifest — populated on the first resolveManifest() call so later
  // calls from a second site return the same Providers/navigation/etc.
  let cachedManifest: ResolvedManifest<TSlots, TNavItem, Record<string, unknown>> | null = null;

  // Options captured from the first resolveManifest() invocation, honored by
  // every subsequent call (including retries after a failed buildAssembly).
  // We commit to "there has been a first call" *before* anything that can
  // throw — otherwise a first call that throws in buildAssembly would leave
  // `cachedManifest` null and let a retry slip different options past the
  // "options may only be passed on the first call" guard.
  let firstCallCompleted = false;
  let capturedOptions: ResolveManifestOptions<TSharedDependencies, TSlots> | undefined = undefined;

  // onRegister must run at most once per module for the lifetime of the
  // registry — modules commonly use it to subscribe to stores or register
  // side-effects against a framework singleton, and double-firing would
  // double-register those. We track this independently of cachedManifest
  // because cachedManifest is only populated on *successful* manifest build:
  // if buildAssembly throws after onRegister ran, a retry of
  // resolveManifest() would otherwise walk the hooks a second time.
  let onRegisterRan = false;

  const availableKeys = new Set<string>([
    ...Object.keys(config.stores ?? {}),
    ...Object.keys(config.services ?? {}),
    ...Object.keys(config.reactiveServices ?? {}),
  ]);

  function assertCanRegister() {
    if (registrationLocked) {
      throw new Error(
        "[@tanstack-react-modules/runtime] Cannot register modules after resolve() or resolveManifest() has been called.",
      );
    }
  }

  function buildAssembly(options: {
    providers?: React.ComponentType<{ children: React.ReactNode }>[];
    slotFilter?: (slots: TSlots, deps: TSharedDependencies) => TSlots;
  }): CommonAssembly<TSlots, TNavItem> {
    validateNoDuplicateIds(modules as ModuleDescriptor[], lazyModules as LazyModuleDescriptor[]);
    validateDependencies(modules as ModuleDescriptor[], availableKeys);
    validateEntryExitShape(modules as ModuleDescriptor[]);

    for (const plugin of plugins) {
      plugin.validate?.({ modules });
    }

    if (!onRegisterRan) {
      const deps = buildDepsObject<TSharedDependencies>(config);
      for (const mod of modules) {
        try {
          mod.lifecycle?.onRegister?.(deps);
        } catch (err) {
          // Flip the flag before throwing so a retry doesn't re-walk hooks
          // that may have already run for earlier modules before this one
          // threw. A half-registered state is still better than a
          // double-registered one.
          onRegisterRan = true;
          throw new Error(
            `[@tanstack-react-modules/runtime] Module "${mod.id}" lifecycle.onRegister() failed: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          );
        }
      }
      onRegisterRan = true;
    }

    // Collect plugin-contributed nav items before building the manifest so
    // they participate in the same sort / group logic as module items.
    // Plugins only see the structural `NavigationItemBase` bound, so the
    // returned items are widened to `TNavItem` at the assembly boundary —
    // plugins that need narrowed typing accept their own `buildNavItem`
    // adapter (see `journeysPlugin`).
    const pluginNavItems: NavigationItemBase[] = [];
    for (const plugin of plugins) {
      const contributed = plugin.contributeNavigation?.({ modules });
      if (contributed && contributed.length > 0) pluginNavItems.push(...contributed);
    }
    const navigation = buildNavigationManifest<TNavItem>(
      modules,
      pluginNavItems as unknown as readonly TNavItem[],
    );
    const slots = buildSlotsManifest<TSlots>(modules, config.slots);
    const dynamicSlotFactories = collectDynamicSlotFactories(modules as ModuleDescriptor[]);
    const slotFilter = options.slotFilter as SlotFilter | undefined;

    const stores: Record<string, StoreApi<unknown>> = {};
    const services: Record<string, unknown> = {};
    const reactiveServices: Record<string, ReactiveService<unknown>> = {};

    if (config.stores) {
      for (const [key, store] of Object.entries(config.stores)) {
        if (store) stores[key] = store as StoreApi<unknown>;
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
    for (const mod of modules)
      moduleDescriptors[mod.id] = mod as ModuleDescriptor<any, any, any, any>;

    // Plugin onResolve: collect runtimes by name and append any React
    // providers after user-supplied providers. `debug` matches the journeys
    // runtime's own environment-based default (NODE_ENV !== "production")
    // so plugins that respect this flag get verbose dev output without an
    // explicit opt-in per plugin.
    const extensions: Record<string, unknown> = {};
    const pluginProviders: React.ComponentType<{ children: React.ReactNode }>[] = [];
    const debug = isDevEnv();
    for (const plugin of plugins) {
      const runtime = plugin.onResolve?.({
        modules,
        moduleDescriptors,
        debug,
      });
      extensions[plugin.name] = runtime;
      const contributed = plugin.providers?.({ runtime });
      if (contributed) pluginProviders.push(...contributed);
    }

    const combinedProviders =
      options.providers || pluginProviders.length > 0
        ? [...(options.providers ?? []), ...pluginProviders]
        : undefined;

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
      providers: combinedProviders,
      extensions,
    };
  }

  // Build the base registry object. Plugin `extend` merges onto it in-place
  // when `use()` is called; the public return is the same reference, retyped.
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
          `[@tanstack-react-modules/runtime] Duplicate plugin name "${plugin.name}" — each plugin may be registered at most once.`,
        );
      }

      // Fully resolve the plugin's contribution before mutating registry
      // bookkeeping, so a throw in extend() or a method collision leaves
      // the registry clean and the caller can retry with a fixed plugin.
      //
      // `markDirty` is reserved by the plugin contract for future reactivity
      // support (see `PluginResolveCtx` in @modular-react/core); plugins may
      // call it when internal state changes, but today it is a no-op by
      // design. Not a missed wiring.
      const extension = plugin.extend({ markDirty: () => {} });
      const entries = Object.entries(extension);
      for (const [key] of entries) {
        if (key in registry) {
          throw new Error(
            `[@tanstack-react-modules/runtime] Plugin "${plugin.name}" attempted to overwrite registry method "${key}".`,
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
      options?: ResolveOptions<TSharedDependencies, TSlots>,
    ): ApplicationManifest<TSlots, TNavItem, Record<string, unknown>> {
      if (mode === "resolveManifest") {
        throw new Error(
          "[@tanstack-react-modules/runtime] resolve() cannot be called after resolveManifest() — the registry is already in framework-mode.",
        );
      }
      if (mode === "resolve") {
        throw new Error("[@tanstack-react-modules/runtime] resolve() can only be called once.");
      }
      mode = "resolve";
      registrationLocked = true;

      const assembly = buildAssembly({
        providers: options?.providers,
        slotFilter: options?.slotFilter,
      });

      const routeBuilderOptions: RouteBuilderOptions = {
        rootRoute: options?.rootRoute,
        rootComponent: options?.rootComponent,
        indexComponent: options?.indexComponent,
        notFoundComponent: options?.notFoundComponent,
        beforeLoad: options?.beforeLoad,
        authenticatedRoute: options?.authenticatedRoute,
        shellRoutes: options?.shellRoutes,
      };
      const routeTree = buildRouteTree(
        modules as ModuleDescriptor[],
        lazyModules as LazyModuleDescriptor[],
        routeBuilderOptions,
      );

      const router = createRouter({
        routeTree,
        defaultPreload: "intent",
      });

      const App = createAppComponent({
        router,
        stores: assembly.stores,
        services: assembly.services,
        reactiveServices: assembly.reactiveServices,
        navigation: assembly.navigation,
        slots: assembly.slots as object,
        modules: assembly.modules,
        providers: assembly.providers,
        dynamicSlotFactories: assembly.dynamicSlotFactories,
        slotFilter: assembly.slotFilter,
        slotsSignal: assembly.slotsSignal,
        recalculateSlots: assembly.recalculateSlots,
      });

      return {
        App,
        router,
        navigation: assembly.navigation,
        slots: assembly.slots,
        modules: assembly.modules,
        moduleDescriptors: assembly.moduleDescriptors,
        extensions: assembly.extensions,
        // The public `.journeys` type comes from `PluginRuntimesOf<TPlugins>`
        // on the outer `ModuleRegistry` surface. `createRegistry` doesn't
        // thread `TPlugins` through — at this site the runtime value is
        // whatever the journeys plugin (if any) wrote into `extensions`.
        // The outer `as unknown as ModuleRegistry<...>` cast at the bottom
        // of the function re-applies the correct public type.
        journeys: assembly.extensions.journeys as never,
        recalculateSlots: assembly.recalculateSlots,
      };
    },

    resolveManifest(
      options?: ResolveManifestOptions<TSharedDependencies, TSlots>,
    ): ResolvedManifest<TSlots, TNavItem, Record<string, unknown>> {
      if (mode === "resolve") {
        throw new Error(
          "[@tanstack-react-modules/runtime] resolveManifest() cannot be called after resolve() — the registry already owns a router.",
        );
      }

      if (firstCallCompleted) {
        if (options !== undefined) {
          throw new Error(
            "[@tanstack-react-modules/runtime] resolveManifest() has already been called — options may only be passed on the first call. Extract the manifest into a shared module and import it from both sites.",
          );
        }
        if (cachedManifest) return cachedManifest;
      } else {
        capturedOptions = options;
        firstCallCompleted = true;
      }

      if (lazyModules.length > 0) {
        throw new Error(
          `[@tanstack-react-modules/runtime] resolveManifest() does not support registerLazy() — the host owns route composition in framework mode, so there is no parent route to attach a lazy catch-all to. Register the module(s) eagerly with register() (use lazyRouteComponent() or .lazy.tsx inside the module's route files for code-splitting), or use resolve() if you need runtime-loaded route structure. Lazy modules registered: ${lazyModules.map((m) => m.id).join(", ")}.`,
        );
      }

      mode = "resolveManifest";
      registrationLocked = true;

      const assembly = buildAssembly({
        providers: capturedOptions?.providers,
        slotFilter: capturedOptions?.slotFilter,
      });
      const Providers = createProvidersComponent({
        stores: assembly.stores,
        services: assembly.services,
        reactiveServices: assembly.reactiveServices,
        navigation: assembly.navigation,
        slots: assembly.slots as object,
        modules: assembly.modules,
        providers: assembly.providers,
        dynamicSlotFactories: assembly.dynamicSlotFactories,
        slotFilter: assembly.slotFilter,
        slotsSignal: assembly.slotsSignal,
        recalculateSlots: assembly.recalculateSlots,
      });

      cachedManifest = {
        Providers,
        navigation: assembly.navigation,
        slots: assembly.slots,
        modules: assembly.modules,
        moduleDescriptors: assembly.moduleDescriptors,
        extensions: assembly.extensions,
        // See the matching comment in resolve() — public `.journeys` type
        // comes from `PluginRuntimesOf<TPlugins>` via the outer cast.
        journeys: assembly.extensions.journeys as never,
        onModuleExit: capturedOptions?.onModuleExit,
        recalculateSlots: assembly.recalculateSlots,
      };

      return cachedManifest;
    },
  };

  return registry as unknown as ModuleRegistry<TSharedDependencies, TSlots, TNavItem, readonly []>;
}

function isDevEnv(): boolean {
  try {
    const g = globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } };
    return !!g.process && g.process.env?.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

function buildDepsObject<TSharedDependencies extends Record<string, any>>(
  config: RegistryConfig<TSharedDependencies, any>,
): TSharedDependencies {
  const deps: Record<string, unknown> = {};

  if (config.stores) {
    for (const [key, store] of Object.entries(config.stores)) {
      if (store) {
        deps[key] = (store as StoreApi<unknown>).getState();
      }
    }
  }
  if (config.services) {
    for (const [key, service] of Object.entries(config.services)) {
      if (service !== undefined) deps[key] = service;
    }
  }
  if (config.reactiveServices) {
    for (const [key, rs] of Object.entries(config.reactiveServices)) {
      if (rs) {
        deps[key] = (rs as ReactiveService<unknown>).getSnapshot();
      }
    }
  }

  return deps as TSharedDependencies;
}
