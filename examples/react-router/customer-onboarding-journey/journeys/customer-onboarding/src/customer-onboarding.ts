import { defineJourney, defineJourneyHandle } from "@modular-react/journeys";
import type { PlanHint, SubscriptionPlan } from "@example-onboarding/app-shared";
import type profileModule from "@example-onboarding/profile-module";
import type planModule from "@example-onboarding/plan-module";
import type billingModule from "@example-onboarding/billing-module";

// All three imports are `import type` — modules are NOT pulled into this
// package's bundle. The runtime resolves step components by id against the
// registered descriptors.
type OnboardingModules = {
  readonly profile: typeof profileModule;
  readonly plan: typeof planModule;
  readonly billing: typeof billingModule;
};

export interface OnboardingInput {
  readonly customerId: string;
}

export interface OnboardingState {
  readonly customerId: string;
  readonly hint: PlanHint | null;
  readonly selectedPlan: SubscriptionPlan | null;
  readonly outcome:
    | { readonly kind: "paid"; readonly reference: string; readonly amount: number }
    | { readonly kind: "trial"; readonly trialId: string; readonly trialEndsAt: string }
    | null;
}

export const customerOnboardingJourney = defineJourney<OnboardingModules, OnboardingState>()({
  id: "customer-onboarding",
  version: "1.0.0",
  meta: {
    name: "Customer onboarding",
    category: "growth",
  },

  // OPTIONAL — declare the module version ranges this journey was authored
  // against. The journeys plugin checks each one against the registered
  // module's `version` at `resolveManifest()` time and refuses to come up
  // if any module shipped a backwards-incompatible bump. Omit this block
  // when journey + modules ship from the same team in the same release;
  // it earns its keep when modules are versioned independently.
  moduleCompat: {
    profile: "^1.0.0",
    plan: "^1.0.0",
    billing: "^1.0.0",
  },

  initialState: ({ customerId }: OnboardingInput) => ({
    customerId,
    hint: null,
    selectedPlan: null,
    outcome: null,
  }),

  start: (state) => ({
    module: "profile",
    entry: "review",
    input: { customerId: state.customerId },
  }),

  transitions: {
    profile: {
      review: {
        profileComplete: ({ output, state }) => ({
          state: { ...state, hint: output.hint },
          next: {
            module: "plan",
            entry: "choose",
            input: { customerId: state.customerId, hint: output.hint },
          },
        }),
        readyToBuy: ({ output }) => ({
          next: {
            module: "billing",
            entry: "collect",
            input: { customerId: output.customerId, amount: output.amount },
          },
        }),
        needsMoreDetails: ({ output }) => ({
          abort: { reason: "profile-incomplete", missing: output.missing },
        }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
    },
    plan: {
      choose: {
        allowBack: true,
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
        allowBack: true,
        paid: ({ output, state }) => ({
          state: {
            ...state,
            outcome: {
              kind: "paid",
              reference: output.reference,
              amount: output.amount,
            } as const,
          },
          complete: { kind: "paid", reference: output.reference, amount: output.amount },
        }),
        failed: ({ output }) => ({
          abort: { reason: "payment-failed", detail: output.reason },
        }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
      startTrial: {
        trialActivated: ({ output, state }) => ({
          state: {
            ...state,
            outcome: {
              kind: "trial",
              trialId: output.trialId,
              trialEndsAt: output.trialEndsAt,
            } as const,
          },
          complete: {
            kind: "trial",
            trialId: output.trialId,
            trialEndsAt: output.trialEndsAt,
          },
        }),
        failed: ({ output }) => ({
          abort: { reason: "trial-failed", detail: output.reason },
        }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
    },
  },

  onAbandon: ({ step, state }) => ({
    // Project only non-identifying fields — the full state carries `customerId`,
    // and shell-level analytics sinks (Sentry tags, event logs) would exfiltrate
    // it by default if it rode along in the abort payload.
    abort: {
      reason: "abandoned",
      at: step?.moduleId,
      hint: state.hint,
      selectedPlan: state.selectedPlan,
      outcome: state.outcome,
    },
  }),

  onHydrate: (blob) => {
    if (blob.version !== "1.0.0") {
      throw new Error(`Unknown customer-onboarding journey version: ${blob.version}`);
    }
    return blob;
  },
});

export type CustomerOnboardingJourney = typeof customerOnboardingJourney;

/**
 * Typed token for opening this journey. Modules and shells import the
 * handle (via `import type`) to call `runtime.start(handle, input)` with
 * full input checking — without pulling the journey's runtime code into
 * the caller's bundle.
 */
export const customerOnboardingHandle = defineJourneyHandle(customerOnboardingJourney);
export type CustomerOnboardingHandle = typeof customerOnboardingHandle;
