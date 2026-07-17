import type { SubscriptionPlan } from "@example-vue-onboarding/app-shared";

export interface CollectPaymentInput {
  readonly customerId: string;
  readonly amount: number;
}

export interface StartTrialInput {
  readonly customerId: string;
  readonly plan: SubscriptionPlan;
}
