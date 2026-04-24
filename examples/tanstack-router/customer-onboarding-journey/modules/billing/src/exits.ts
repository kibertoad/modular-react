import { defineExit } from "@modular-react/core";

export const billingExits = {
  paid: defineExit<{ reference: string; amount: number }>(),
  trialActivated: defineExit<{ trialId: string; trialEndsAt: string }>(),
  failed: defineExit<{ reason: string }>(),
  cancelled: defineExit(),
} as const;

export type BillingExits = typeof billingExits;
