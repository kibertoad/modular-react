import type { IntegrationConfig } from "./integrations.js";

export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

export interface AppSlots {
  readonly commands: readonly Command[];
}

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

export interface AppRouteData {
  readonly integration?: IntegrationConfig;
  readonly pageTitle?: string;
}
