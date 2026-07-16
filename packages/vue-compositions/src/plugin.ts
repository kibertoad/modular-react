import { defineComponent, h } from "vue";
import type { ModuleTypeMap, RegistryPlugin, UiComponent, UiNode } from "@modular-frontend/core";

import {
  createCompositionRuntime,
  CompositionValidationError,
  validateCompositionContracts,
  validateCompositionDefinition,
} from "@modular-frontend/compositions-engine";
import type {
  AnyCompositionDefinition,
  CompositionDefinition,
  CompositionRegisterOptions,
  CompositionRuntime,
  CompositionZoneMap,
  RegisteredComposition,
} from "@modular-frontend/compositions-engine";

import { CompositionsProvider } from "./provider.js";

/**
 * Methods the compositions plugin contributes to the registry. Registered
 * plugins type-intersect with the base registry so shells call
 * `registry.registerComposition(...)` with full type support. The Vue analog of
 * the React `CompositionsPluginExtension`.
 */
export interface CompositionsPluginExtension {
  registerComposition<
    TModules extends ModuleTypeMap,
    TZones extends CompositionZoneMap<TModules, TState>,
    TState,
    TInput = void,
  >(
    definition: CompositionDefinition<TModules, TZones, TState, TInput>,
    options?: CompositionRegisterOptions<TState>,
  ): void;
}

export interface CompositionsPluginOptions {
  /**
   * Enable verbose runtime logging. Defaults to `false`; plugins propagate the
   * registry-level debug flag when set.
   */
  readonly debug?: boolean;
  /**
   * Opaque shared-dependency bag the shell hands to the plugin factory (not
   * read from `PluginResolveCtx`). Threaded verbatim into every zone selector's
   * `ctx.deps` and into composition lifecycle hooks, so selectors and
   * `onMount`/`onUnmount` can read shared state without re-importing
   * module-scoped stores.
   *
   * Pass this if your composition selectors need access to long-lived shell
   * objects (auth, feature flags, telemetry sinks); leave it out for
   * layout-only compositions whose state is fully self-contained.
   */
  readonly deps?: Readonly<Record<string, unknown>>;
}

/**
 * Creates the compositions plugin. Pass to
 * `registry.use(compositionsPlugin())` (or
 * `createRegistry({ plugins: [...] })`) to enable composition registration and
 * outlet rendering without the runtime packages depending on
 * `@modular-vue/compositions` directly. The Vue analog of the React
 * `compositionsPlugin`; the only framework-specific piece is `providers()`,
 * which contributes a Vue `<CompositionsProvider>` instead of a React one.
 *
 * The plugin:
 *   - contributes `registerComposition(...)` onto the registry
 *   - validates structural definitions immediately, contract / module
 *     references at resolve time
 *   - produces a `CompositionRuntime` on `manifest.extensions.compositions`
 *   - wraps the provider stack in `<CompositionsProvider :runtime="…" />`
 *
 * **Instantiate per registry.** The returned object closes over a registration
 * list; passing the same instance to two `createRegistry()` calls would make
 * them share that list.
 */
export function compositionsPlugin(
  options: CompositionsPluginOptions = {},
): RegistryPlugin<"compositions", CompositionsPluginExtension, CompositionRuntime> {
  const registered: RegisteredComposition[] = [];
  // Hard guard against reusing the same plugin instance across two registries
  // (or two resolve passes on the same registry). The `registered` array is
  // closed over by the instance, so a second pass would silently accumulate
  // duplicates and the runtime's own duplicate-id error would fire with a
  // message that doesn't point at the cause. Fail loudly the second time
  // `onResolve` runs.
  let resolved = false;

  return {
    name: "compositions",

    extend() {
      return {
        registerComposition<
          TModules extends ModuleTypeMap,
          TZones extends CompositionZoneMap<TModules, TState>,
          TState,
          TInput = void,
        >(
          definition: CompositionDefinition<TModules, TZones, TState, TInput>,
          regOpts?: CompositionRegisterOptions<TState>,
        ): void {
          if (resolved) {
            throw new Error(
              "[@modular-vue/compositions] `registerComposition` called after the plugin already resolved — instantiate a fresh `compositionsPlugin()` per registry instead of reusing one.",
            );
          }
          const def = definition as AnyCompositionDefinition;
          const issues = validateCompositionDefinition(def);
          if (issues.length > 0) throw new CompositionValidationError(issues);
          registered.push({
            definition: def,
            options: regOpts as CompositionRegisterOptions | undefined,
          });
        },
      };
    },

    validate({ modules }) {
      if (registered.length > 0) {
        validateCompositionContracts(registered, modules);
      }
    },

    onResolve({ moduleDescriptors, debug }) {
      if (resolved) {
        throw new Error(
          "[@modular-vue/compositions] `compositionsPlugin()` was resolved twice — instantiate a fresh plugin per registry.",
        );
      }
      resolved = true;
      return createCompositionRuntime(registered, {
        modules: moduleDescriptors,
        debug: options.debug ?? debug,
        deps: options.deps,
      });
    },

    providers({ runtime }) {
      const BoundProvider = defineComponent({
        name: "CompositionsPluginProvider",
        setup(_props, { slots }) {
          return () => h(CompositionsProvider, { runtime }, () => slots.default?.());
        },
      });
      return [BoundProvider as unknown as UiComponent<{ children: UiNode }>];
    },
  };
}
