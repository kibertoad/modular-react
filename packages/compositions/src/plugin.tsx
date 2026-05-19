import type { ComponentType, ReactNode } from "react";
import type { ModuleTypeMap, RegistryPlugin } from "@modular-react/core";

import { createCompositionRuntime } from "./runtime.js";
import { CompositionsProvider } from "./provider.js";
import {
  CompositionValidationError,
  validateCompositionContracts,
  validateCompositionDefinition,
} from "./validation.js";
import type {
  AnyCompositionDefinition,
  CompositionDefinition,
  CompositionRegisterOptions,
  CompositionRuntime,
  RegisteredComposition,
  CompositionZoneMap,
} from "./types.js";

/**
 * Methods the compositions plugin contributes to the registry. Registered
 * plugins type-intersect with the base `ModuleRegistry` so shells call
 * `registry.registerComposition(...)` with full type support.
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
   * Enable verbose runtime logging. Defaults to `false`; plugins
   * propagate the registry-level debug flag when set.
   */
  readonly debug?: boolean;
  /**
   * Opaque shared-dependency bag the shell hands to the plugin factory
   * (not read from `PluginResolveCtx`). Threaded verbatim into every
   * zone selector's `ctx.deps` and into composition lifecycle hooks,
   * so selectors and `onMount`/`onUnmount` can read shared state
   * without re-importing module-scoped stores.
   *
   * Pass this if your composition selectors need access to long-lived
   * shells objects (auth, feature flags, telemetry sinks); leave it
   * out for layout-only compositions whose state is fully self-
   * contained.
   */
  readonly deps?: Readonly<Record<string, unknown>>;
}

/**
 * Creates the compositions plugin. Pass to
 * `registry.use(compositionsPlugin())` to enable composition
 * registration and outlet rendering without the runtime packages
 * depending on `@modular-react/compositions` directly.
 *
 * The plugin:
 *   - contributes `registerComposition(...)` onto the registry
 *   - validates structural definitions immediately, contract / module
 *     references at resolve time
 *   - produces a `CompositionRuntime` on `manifest.extensions.compositions`
 *   - wraps the provider stack in `<CompositionsProvider runtime={...} />`
 *
 * **Instantiate per registry.** The returned object closes over a
 * registration list; passing the same instance to two `createRegistry()`
 * calls would make them share that list.
 */
export function compositionsPlugin(
  options: CompositionsPluginOptions = {},
): RegistryPlugin<"compositions", CompositionsPluginExtension, CompositionRuntime> {
  const registered: RegisteredComposition[] = [];
  // Hard guard against reusing the same plugin instance across two
  // registries (or two `.resolve()` calls on the same registry rebuild
  // path). The `registered` array is closed over by the instance, so a
  // second pass would silently accumulate duplicates and the runtime's
  // own duplicate-id error would fire with a message that doesn't
  // point at the cause. Fail loudly the second time `onResolve` runs.
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
              "[@modular-react/compositions] `registerComposition` called after the plugin already resolved — instantiate a fresh `compositionsPlugin()` per registry instead of reusing one.",
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
          "[@modular-react/compositions] `compositionsPlugin()` was resolved twice — instantiate a fresh plugin per registry.",
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
      const BoundProvider: ComponentType<{ children: ReactNode }> = ({ children }) => (
        <CompositionsProvider runtime={runtime}>{children}</CompositionsProvider>
      );
      BoundProvider.displayName = "CompositionsPluginProvider";
      return [BoundProvider];
    },
  };
}
