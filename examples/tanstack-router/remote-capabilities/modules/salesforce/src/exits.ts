import { defineExit } from "@modular-react/core";

export const salesforceExits = {
  saved: defineExit<{ instanceUrl: string; accessToken: string }>(),
  cancelled: defineExit(),
} as const;

export type SalesforceExits = typeof salesforceExits;
