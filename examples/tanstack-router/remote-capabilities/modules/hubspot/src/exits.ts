import { defineExit } from "@modular-react/core";

export const hubspotExits = {
  saved: defineExit<{ portalId: string; privateAppToken: string }>(),
  cancelled: defineExit(),
} as const;

export type HubspotExits = typeof hubspotExits;
