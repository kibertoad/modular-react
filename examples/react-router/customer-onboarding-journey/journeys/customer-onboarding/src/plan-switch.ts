import { defineJourney, defineJourneyHandle } from "@modular-react/journeys";
import type { SubscriptionPlan } from "@example-onboarding/app-shared";
import type planModule from "@example-onboarding/plan-module";
import type billingModule from "@example-onboarding/billing-module";

/**
 * Existing customer changing their plan. No profile review step — go
 * straight to the plan chooser, then billing. Completes on payment;
 * aborts on failure or cancel.
 *
 * Reuses the plan and billing modules from the onboarding flow. Shipping
 * alongside `customer-onboarding` in the same package keeps all
 * growth-team journeys in one place, even though each lives in its own
 * file.
 */

type PlanSwitchModules = {
  readonly plan: typeof planModule;
  readonly billing: typeof billingModule;
};

export interface PlanSwitchInput {
  readonly customerId: string;
  /** Seed the plan chooser with whatever tier the customer already has. */
  readonly currentTier: SubscriptionPlan["tier"];
}

interface PlanSwitchState {
  readonly customerId: string;
  readonly selectedPlan: SubscriptionPlan | null;
}

export const planSwitchJourney = defineJourney<PlanSwitchModules, PlanSwitchState>()({
  id: "plan-switch",
  version: "1.0.0",
  meta: {
    name: "Plan switch",
    category: "growth",
  },

  initialState: ({ customerId }: PlanSwitchInput) => ({
    customerId,
    selectedPlan: null,
  }),

  start: (state, input: PlanSwitchInput) => ({
    module: "plan",
    entry: "choose",
    input: {
      customerId: state.customerId,
      hint: {
        suggestedTier: input.currentTier,
        rationale: "Current tier — switch from here.",
      },
    },
  }),

  transitions: {
    plan: {
      choose: {
        choseStandard: ({ output, state }) => ({
          state: { ...state, selectedPlan: output.plan },
          next: {
            module: "billing",
            entry: "collect",
            input: { customerId: state.customerId, amount: output.plan.monthly },
          },
        }),
        choseWithTrial: ({ output, state }) => ({
          state: { ...state, selectedPlan: output.plan },
          next: {
            module: "billing",
            entry: "startTrial",
            input: { customerId: state.customerId, plan: output.plan },
          },
        }),
        noFit: ({ output }) => ({
          abort: { reason: "plan-no-fit", detail: output.reason },
        }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
    },
    billing: {
      collect: {
        paid: ({ output }) => ({
          complete: { kind: "paid", reference: output.reference, amount: output.amount },
        }),
        failed: ({ output }) => ({ abort: { reason: "payment-failed", detail: output.reason } }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
      startTrial: {
        trialActivated: ({ output }) => ({
          complete: { kind: "trial", trialId: output.trialId, trialEndsAt: output.trialEndsAt },
        }),
        failed: ({ output }) => ({ abort: { reason: "trial-failed", detail: output.reason } }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
    },
  },
});

export const planSwitchHandle = defineJourneyHandle(planSwitchJourney);
export type PlanSwitchHandle = typeof planSwitchHandle;
