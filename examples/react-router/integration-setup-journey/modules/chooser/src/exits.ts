import { defineExit } from "@modular-react/core";
import type { IntegrationKind } from "@example-rr-integration-setup/app-shared";

export const chooserExits = {
  /** User picked an integration to configure. */
  chosen: defineExit<{ kind: IntegrationKind }>(),
  /** User backed out. */
  cancelled: defineExit(),
} as const;

export type ChooserExits = typeof chooserExits;
