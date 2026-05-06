import { defineExit } from "@modular-react/core";
import type { IntegrationKind } from "@example-tsr-remote-capabilities/app-shared";

export const genericExits = {
  saved: defineExit<{ kind: IntegrationKind; apiKey: string }>(),
  cancelled: defineExit(),
} as const;

export type GenericExits = typeof genericExits;
