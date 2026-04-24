import { defineExit } from "@modular-react/core";
import type { SubscriptionPlan } from "@example-tsr-onboarding/app-shared";

export const planExits = {
  /** Customer picked a paid plan and wants to be charged now. */
  choseStandard: defineExit<{ plan: SubscriptionPlan }>(),
  /** Customer picked a plan but asked to start on a free trial. */
  choseWithTrial: defineExit<{ plan: SubscriptionPlan }>(),
  /** Nothing fit — back-office follow-up. */
  noFit: defineExit<{ reason: string }>(),
  cancelled: defineExit(),
} as const;

export type PlanExits = typeof planExits;
