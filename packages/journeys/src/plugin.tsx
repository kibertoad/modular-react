import type { ComponentType, ReactNode } from "react";
import type {
  JourneyRuntime,
  ModuleTypeMap,
  NavigationItemBase,
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
  JourneyNavContribution,
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
   * `options.persistence` is typed against the journey's state, and
   * `options.nav.buildInput` is typed against the journey's input — pass a
   * typed definition and both are checked end-to-end.
   */
  registerJourney<TModules extends ModuleTypeMap, TState, TInput>(
    definition: JourneyDefinition<TModules, TState, TInput>,
    options?: JourneyRegisterOptions<TState, TInput>,
  ): void;
}

/**
 * Default shape the journeys plugin emits for each `nav`-carrying journey.
 * When {@link JourneysPluginOptions.buildNavItem} is provided, the plugin
 * hands this default (plus the journey's id and buildInput factory) to the
 * adapter so apps can reshape the item into their narrowed `TNavItem`.
 */
export interface JourneyDefaultNavItem extends NavigationItemBase {
  readonly label: string;
  /**
   * Always empty for a journey launcher — the dispatchable action lives in
   * {@link JourneyDefaultNavItem.action}, so there is no URL to follow. An
   * empty string keeps the structural `NavigationItemBase.to` satisfied
   * without suggesting the shell should treat this item as a link.
   */
  readonly to: "";
  readonly icon?: string | ComponentType<{ className?: string }>;
  readonly group?: string;
  readonly order?: number;
  readonly hidden?: boolean;
  readonly meta?: unknown;
  readonly action: {
    readonly kind: "journey-start";
    readonly journeyId: string;
    readonly buildInput?: (ctx?: unknown) => unknown;
  };
}

/**
 * Signature for the optional typed adapter that reshapes the plugin's
 * default nav item into the app's narrowed `TNavItem`. The adapter is
 * called once per `nav`-carrying journey at manifest time.
 */
export type JourneyNavItemBuilder<TNavItem extends NavigationItemBase> = (
  defaults: JourneyDefaultNavItem,
  raw: JourneyNavContribution<unknown> & { readonly journeyId: string },
) => TNavItem;

export interface JourneysPluginOptions<
  TNavItem extends NavigationItemBase = JourneyDefaultNavItem,
> {
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
  /**
   * Optional adapter that reshapes the plugin's default nav item into the
   * app's narrowed `TNavItem`. Apps that use a typed `NavigationItem`
   * alias (typed label union, typed action union, typed meta bag) should
   * supply this so contributed items land in `manifest.navigation` with
   * the correct narrowed type. When omitted, the plugin emits items as
   * {@link JourneyDefaultNavItem} and the framework widens them to
   * `TNavItem` at the assembly boundary.
   */
  readonly buildNavItem?: JourneyNavItemBuilder<TNavItem>;
}

/**
 * Creates the journeys plugin. Pass to `registry.use(journeysPlugin())` to
 * enable journey registration and outlet rendering without the runtime
 * packages depending on `@modular-react/journeys` directly.
 *
 * The plugin:
 *   - contributes `registerJourney(...)` onto the registry (type-safe)
 *   - validates contracts against registered modules at resolve time
 *   - produces a `JourneyRuntime` on `manifest.extensions.journeys` (also
 *     surfaced as the `manifest.journeys` convenience alias)
 *   - wraps the provider stack in `<JourneyProvider runtime={...} />`
 *
 * **Instantiate per registry.** The returned object closes over a
 * journey-registration list; passing the same instance to two
 * `createRegistry()` calls causes them to share that list. Call
 * `journeysPlugin()` once per registry.
 */
export function journeysPlugin<TNavItem extends NavigationItemBase = JourneyDefaultNavItem>(
  options: JourneysPluginOptions<TNavItem> = {},
): RegistryPlugin<"journeys", JourneysPluginExtension, JourneyRuntime> {
  const registered: RegisteredJourney[] = [];

  return {
    name: "journeys",

    extend() {
      return {
        registerJourney<TModules extends ModuleTypeMap, TState, TInput>(
          definition: JourneyDefinition<TModules, TState, TInput>,
          regOpts?: JourneyRegisterOptions<TState, TInput>,
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

    contributeNavigation() {
      const items: NavigationItemBase[] = [];
      for (const reg of registered) {
        const nav = reg.options?.nav;
        if (!nav) continue;
        const defaults: JourneyDefaultNavItem = {
          label: nav.label,
          to: "",
          ...(nav.icon !== undefined ? { icon: nav.icon } : {}),
          ...(nav.group !== undefined ? { group: nav.group } : {}),
          ...(nav.order !== undefined ? { order: nav.order } : {}),
          ...(nav.hidden !== undefined ? { hidden: nav.hidden } : {}),
          ...(nav.meta !== undefined ? { meta: nav.meta } : {}),
          action: {
            kind: "journey-start",
            journeyId: reg.definition.id,
            ...(nav.buildInput ? { buildInput: nav.buildInput } : {}),
          },
        };
        if (options.buildNavItem) {
          items.push(
            options.buildNavItem(defaults, {
              ...(nav as JourneyNavContribution<unknown>),
              journeyId: reg.definition.id,
            }),
          );
        } else {
          items.push(defaults);
        }
      }
      return items;
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
