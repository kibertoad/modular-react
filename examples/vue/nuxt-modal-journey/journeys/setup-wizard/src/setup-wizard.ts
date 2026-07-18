import { defineJourney, defineJourneyHandle } from "@modular-vue/journeys";
import type { SubscriptionPlan } from "@example-vue-nuxt-modal/app-shared";
import type wizardModule from "@example-vue-nuxt-modal/wizard-module";

// `import type` — the module is resolved by id against the registered
// descriptors at runtime, never bundled into this journey package.
type WizardModules = {
  readonly wizard: typeof wizardModule;
};

export interface SetupWizardInput {
  readonly frameId: string;
}

export interface SetupWizardState {
  readonly frameId: string;
  readonly plan: SubscriptionPlan | null;
}

export interface SetupWizardOutput {
  readonly plan: SubscriptionPlan;
}

// `defineJourney<Modules, State, Output>()` — `Input` is inferred from
// `initialState`'s parameter annotation.
export const setupWizardJourney = defineJourney<
  WizardModules,
  SetupWizardState,
  SetupWizardOutput
>()({
  id: "setup-wizard",
  version: "1.0.0",
  meta: { name: "Environment setup wizard" },

  initialState: ({ frameId }: SetupWizardInput) => ({ frameId, plan: null }),

  start: (state) => ({
    module: "wizard",
    entry: "choosePlan",
    input: { frameId: state.frameId },
  }),

  transitions: {
    wizard: {
      choosePlan: {
        chose: ({ output, state }) => ({
          state: { ...state, plan: output.plan },
          next: {
            module: "wizard",
            entry: "confirm",
            input: { frameId: state.frameId, plan: output.plan },
          },
        }),
        cancelled: () => ({ abort: { reason: "cancelled" } }),
      },
      confirm: {
        // Enable Back on the confirm step so the rep can return to plan
        // selection; the module entry's `allowBack: "preserve-state"` keeps the
        // chosen plan intact on the way back.
        allowBack: true,
        confirmed: ({ state }) => ({
          // `state.plan` is set by the time confirm is reachable (choosePlan
          // populated it), so assert it for the typed output.
          complete: { plan: state.plan as SubscriptionPlan },
        }),
        cancelled: () => ({ abort: { reason: "cancelled" } }),
      },
    },
  },
});

export type SetupWizardJourney = typeof setupWizardJourney;

/** Typed token for opening the journey with checked `input`. */
export const setupWizardHandle = defineJourneyHandle(setupWizardJourney);
export type SetupWizardHandle = typeof setupWizardHandle;
