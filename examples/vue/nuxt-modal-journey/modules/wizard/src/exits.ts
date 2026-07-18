import { defineExit } from "@modular-frontend/core";
import type { SubscriptionPlan } from "@example-vue-nuxt-modal/app-shared";

/** Exits for the `choosePlan` entry. */
export const choosePlanExits = {
  /** A plan was selected; advance to confirmation. */
  chose: defineExit<{ plan: SubscriptionPlan }>(),
  /** The rep cancelled the whole wizard. */
  cancelled: defineExit(),
} as const;

/** Exits for the `confirm` entry. */
export const confirmExits = {
  /** The selection was confirmed; the journey completes. */
  confirmed: defineExit(),
  /** The rep cancelled the whole wizard. */
  cancelled: defineExit(),
} as const;

export type ChoosePlanExits = typeof choosePlanExits;
export type ConfirmExits = typeof confirmExits;
