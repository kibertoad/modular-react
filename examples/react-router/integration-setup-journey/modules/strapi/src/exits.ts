import { defineExit } from "@modular-react/core";

export const strapiExits = {
  saved: defineExit<{ baseUrl: string; apiToken: string }>(),
  cancelled: defineExit(),
} as const;

export type StrapiExits = typeof strapiExits;
