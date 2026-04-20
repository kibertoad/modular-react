import type { IntegrationConfig } from "./integrations.js";

/**
 * Shared dependencies all modules in this example can read from. Registered
 * on the registry; modules declare which keys they need via `requires`.
 */
export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

/**
 * Slot contributions collected from every module. The example only uses one
 * slot, but this is where additional cross-module surfaces (command palette
 * entries, system registrations, etc.) would go.
 */
export interface AppSlots {
  readonly commands: readonly Command[];
}

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

/**
 * Typed `handle` data every route contributes. Shell zones read this via
 * `useRouteData<AppRouteData>()` — when the user navigates between sibling
 * integrations, the data flips automatically.
 */
export interface AppRouteData {
  readonly integration?: IntegrationConfig;
  readonly pageTitle?: string;
}
