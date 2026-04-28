import { defineExit } from "@modular-react/core";
import type { IntegrationKind } from "@example-tsr-integration-setup/app-shared";

export const pickerExits = {
  /** User picked an integration to configure. */
  chosen: defineExit<{ kind: IntegrationKind }>(),
  /** User backed out. */
  cancelled: defineExit(),
} as const;

export type PickerExits = typeof pickerExits;
