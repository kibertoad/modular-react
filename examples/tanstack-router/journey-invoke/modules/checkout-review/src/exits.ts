import { defineExit } from "@modular-react/core";

export const reviewExits = {
  confirmAge: defineExit<{ orderId: string }>(),
  cancelled: defineExit(),
} as const;

export type ReviewExits = typeof reviewExits;
