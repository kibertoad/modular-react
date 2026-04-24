import { defineExit } from "@modular-react/core";
import type { PlanHint } from "@example-tsr-onboarding/app-shared";

/**
 * Profile module exit vocabulary. The const is consumed both by the module
 * descriptor (for contract validation) and by the review component (for a
 * typed `exit` callback) — so the type flows through without duplication.
 */
export const profileExits = {
  /** Profile is good to go; hand off to plan selection with a recommendation. */
  profileComplete: defineExit<{ customerId: string; hint: PlanHint }>(),
  /** Customer already knows what they want — skip straight to billing. */
  readyToBuy: defineExit<{ customerId: string; amount: number }>(),
  /** Customer can't be onboarded right now (missing identity, KYC, etc.). */
  needsMoreDetails: defineExit<{ customerId: string; missing: string }>(),
  cancelled: defineExit(),
} as const;

export type ProfileExits = typeof profileExits;
