import { defineExit } from "@modular-react/core";

export const reviewExits = {
  /** User wants to proceed — the journey will invoke age verification next. */
  confirmAge: defineExit<{ orderId: string }>(),
  /** User cancelled checkout. The journey aborts. */
  cancelled: defineExit(),
} as const;

export type ReviewExits = typeof reviewExits;
