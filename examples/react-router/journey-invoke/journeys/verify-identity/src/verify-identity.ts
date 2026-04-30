import { defineJourney, defineJourneyHandle } from "@modular-react/journeys";
import type { AgeVerificationToken } from "@example-rr-invoke/app-shared";
import type ageVerifyModule from "@example-rr-invoke/age-verify-module";

// `import type` only — modules are resolved at runtime by id against the
// shell's registered descriptors. The journey carries the type for
// transition checking but never imports the actual module bundle.
type VerifyModules = {
  readonly "age-verify": typeof ageVerifyModule;
};

export interface VerifyIdentityInput {
  readonly customerId: string;
}

export interface VerifyIdentityState {
  readonly customerId: string;
  readonly attempts: number;
}

/**
 * Child journey — invoked from the checkout journey when a purchase
 * requires age verification. Single-step state machine: enter the verify
 * module, then either complete with a token or abort with a reason.
 *
 * The third generic on `defineJourney<TModules, TState, TOutput>()` pins
 * the terminal payload type to `AgeVerificationToken`. The parent's
 * resume handler reads `outcome.payload` typed as exactly this shape —
 * no cast at the call site.
 */
export const verifyIdentityJourney = defineJourney<
  VerifyModules,
  VerifyIdentityState,
  AgeVerificationToken
>()({
  id: "verify-identity",
  version: "1.0.0",
  meta: { name: "Age verification" },

  initialState: ({ customerId }: VerifyIdentityInput) => ({ customerId, attempts: 0 }),

  start: (state) => ({
    module: "age-verify",
    entry: "confirm",
    input: { customerId: state.customerId },
  }),

  transitions: {
    "age-verify": {
      confirm: {
        verified: ({ output }) => ({ complete: output }),
        declined: ({ output }) => ({ abort: { reason: "declined", detail: output.reason } }),
      },
    },
  },

  onHydrate: (blob) => {
    if (blob.version !== "1.0.0") {
      throw new Error(`Unknown verify-identity journey version: ${blob.version}`);
    }
    return blob;
  },
});

export type VerifyIdentityJourney = typeof verifyIdentityJourney;

/**
 * Typed token modules and shells use to open this journey via
 * `runtime.start(handle, input)`. Carries `TInput` / `TOutput` as
 * phantoms so a parent journey's `invoke` clause and resume handler
 * are type-checked end-to-end against this child.
 */
export const verifyIdentityHandle = defineJourneyHandle(verifyIdentityJourney);
export type VerifyIdentityHandle = typeof verifyIdentityHandle;
