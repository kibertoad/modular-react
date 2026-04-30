import { defineExit } from "@modular-react/core";

export const confirmExits = {
  paid: defineExit<{ reference: string; amount: number }>(),
  cancelled: defineExit(),
} as const;

export type ConfirmExits = typeof confirmExits;
