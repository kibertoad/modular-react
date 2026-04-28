import { defineExit } from "@modular-react/core";

export const genericExits = {
  saved: defineExit<{ kind: string; apiKey: string }>(),
  cancelled: defineExit(),
} as const;

export type GenericExits = typeof genericExits;
