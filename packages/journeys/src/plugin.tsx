import type { ComponentType, ReactNode } from "react";
import type {
  JourneyRuntime,
  ModuleTypeMap,
  RegistryPlugin,
} from "@modular-react/core";
import { createJourneyRuntime } from "./runtime.js";
import {
  JourneyValidationError,
  validateJourneyContracts,
  validateJourneyDefinition,
} from "./validation.js";
import { JourneyProvider } from "./provider.js";
import type {
  AnyJourneyDefinition,
  JourneyDefinition,
  JourneyRegisterOptions,
  RegisteredJourney,
} from "./types.js";

/**
 * Methods the journeys plugin contributes to the registry. Registered
 * plugins type-intersect with the base `ModuleRegistry` so shells call
 * `registry.registerJourney(...)` with full type support.
 */
export interface JourneysPluginExtension {
  /**
   * Register a journey definition. The structural shape is validated
   * immediately (missing `id` / `version` / `transitions` etc.);
   * module-level contracts are validated at `resolveManifest()` /
   * `resolve()` time.
   *
   * `options.persistence` is typed against the journey's state — pass a
   * typed definition and the persistence adapter is checked end-to-end.
   */
  registerJourney<TModules extends ModuleTypeMap, TState, TInput>(
    definition: JourneyDefinition<TModules, TState, TInput>,
    options?: JourneyRegisterOptions<TState>,
  ): void;
}

export interface JourneysPluginOptions {
  /**
   * Enable verbose transition / rollback logging in the runtime. Defaults to
   * `false`; plugins propagate the registry-level debug flag when set.
   */
  readonly debug?: boolean;
  /**
   * Forwarded onto `<JourneyProvider>` as the shell-wide `onModuleExit`
   * handler. Use it as a default place to close tabs / forward analytics
   * when a module exit isn't consumed by an explicit prop.
   */
  readonly onModuleExit?: (event: {
    readonly moduleId: string;
    readonly entry: string;
    readonly exit: string;
    readonly output: unknown;
    readonly tabId?: string;
  }) => void;
}

/**
 * Creates the journeys plugin. Pass to `createRegistry({ plugins: [...] })`
 * to enable journey registration and outlet rendering without the runtime
 * packages depending on `@modular-react/journeys` directly.
 *
 * The plugin:
 *   - contributes `registerJourney(...)` onto the registry (type-safe)
 *   - validates contracts against registered modules at resolve time
 *   - produces a `JourneyRuntime` on `manifest.extensions.journeys`
 *   - wraps the provider stack in `<JourneyProvider runtime={...} />`
 */
export function journeysPlugin(
  options: JourneysPluginOptions = {},
): RegistryPlugin<"journeys", JourneysPluginExtension, JourneyRuntime> {
  const registered: RegisteredJourney[] = [];

  return {
    name: "journeys",

    extend() {
      return {
        registerJourney<TModules extends ModuleTypeMap, TState, TInput>(
          definition: JourneyDefinition<TModules, TState, TInput>,
          regOpts?: JourneyRegisterOptions<TState>,
        ): void {
          const def = definition as AnyJourneyDefinition;
          const issues = validateJourneyDefinition(def);
          if (issues.length > 0) {
            throw new JourneyValidationError(issues);
          }
          registered.push({
            definition: def,
            options: regOpts as JourneyRegisterOptions | undefined,
          });
        },
      };
    },

    validate({ modules }) {
      if (registered.length > 0) {
        validateJourneyContracts(registered, modules);
      }
    },

    onResolve({ moduleDescriptors, debug }) {
      return createJourneyRuntime(registered, {
        modules: moduleDescriptors,
        debug: options.debug ?? debug,
      });
    },

    providers({ runtime }) {
      const BoundJourneyProvider: ComponentType<{ children: ReactNode }> = ({ children }) => (
        <JourneyProvider runtime={runtime} onModuleExit={options.onModuleExit}>
          {children}
        </JourneyProvider>
      );
      BoundJourneyProvider.displayName = "JourneysPluginProvider";
      return [BoundJourneyProvider];
    },
  };
}
