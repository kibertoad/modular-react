import type { PlanHint } from "@example-vue-onboarding/app-shared";

export interface ChoosePlanInput {
  readonly customerId: string;
  readonly hint: PlanHint;
}
