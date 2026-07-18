import type { SubscriptionPlan } from "@example-vue-nuxt-modal/app-shared";

export interface ChoosePlanInput {
  readonly frameId: string;
}

export interface ConfirmInput {
  readonly frameId: string;
  readonly plan: SubscriptionPlan;
}
