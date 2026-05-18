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
  ZoneMap,
} from "./types.js";

/**
 * Methods the compositions plugin contributes to the registry. Registered
 * plugins type-intersect with the base `ModuleRegistry` so shells call
 * `registry.registerComposition(...)` with full type support.
 */
export interface CompositionsPluginExtension {
  registerComposition<
    TModules extends ModuleTypeMap,
    TZones extends ZoneMap<TModules, TState>,
    TState,
    TInput = void,
  >(
    definition: CompositionDefinition<TModules, TZones, TState, TInput>,
    options?: CompositionRegisterOptions<TState, TInput>,
  ): void;
}

export interface CompositionsPluginOptions {
  /**
   * Enable verbose runtime logging. Defaults to `false`; plugins
   * propagate the registry-level debug flag when set.
   */
  readonly debug?: boolean;
  /**
   * Shared dependency snapshot threaded into lifecycle hooks and zone
   * selector context. Plugins can pass an opaque deps bag here so
   * composition selectors can read shared state without re-importing
   * stores at module scope.
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

  return {
    name: "compositions",

    extend() {
      return {
        registerComposition<
          TModules extends ModuleTypeMap,
          TZones extends ZoneMap<TModules, TState>,
          TState,
          TInput = void,
        >(
          definition: CompositionDefinition<TModules, TZones, TState, TInput>,
          regOpts?: CompositionRegisterOptions<TState, TInput>,
        ): void {
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
