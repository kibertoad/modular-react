import { defineJourney, defineJourneyHandle } from "@modular-react/journeys";
import type { OrderSummary, AgeVerificationToken } from "@example-rr-invoke/app-shared";
import type checkoutReviewModule from "@example-rr-invoke/checkout-review-module";
import type checkoutConfirmModule from "@example-rr-invoke/checkout-confirm-module";
import { verifyIdentityHandle } from "@example-rr-invoke/verify-identity-journey";

// `import type` — modules are NOT pulled into the journey package's bundle.
// The shell wires the runtime to live module descriptors at registration
// time; the journey only needs the types to cross-check transitions.
type CheckoutModules = {
  readonly "checkout-review": typeof checkoutReviewModule;
  readonly "checkout-confirm": typeof checkoutConfirmModule;
};

export interface CheckoutInput {
  readonly order: OrderSummary;
}

export interface CheckoutState {
  readonly order: OrderSummary;
  readonly verification: AgeVerificationToken | null;
  readonly result:
    | { readonly kind: "paid"; readonly reference: string; readonly amount: number }
    | null;
}

export type CheckoutOutput =
  | { readonly kind: "paid"; readonly reference: string; readonly amount: number }
  | { readonly kind: "abandoned" };

/**
 * Parent journey. Three states: review → (invoke verify-identity) → confirm.
 * The verify-identity child runs invisibly inside the same outlet; when it
 * completes, the parent's `afterAgeVerified` resume folds the token into
 * state and advances to confirm. When it aborts (user declined), the parent
 * aborts too with a discoverable reason.
 */
export const checkoutJourney = defineJourney<CheckoutModules, CheckoutState, CheckoutOutput>()({
  id: "checkout",
  version: "1.0.0",
  meta: { name: "Checkout (with age verification)" },

  initialState: ({ order }: CheckoutInput) => ({ order, verification: null, result: null }),

  start: (state) => ({
    module: "checkout-review",
    entry: "review",
    input: { order: state.order },
  }),

  transitions: {
    "checkout-review": {
      review: {
        // The user wants to proceed. If the order requires age verification,
        // detour into the verify-identity child journey; otherwise jump
        // straight to confirm. The branch is a transition-time decision so
        // a single journey definition handles both cases — no second journey
        // is needed for orders that don't require verification.
        confirmAge: ({ state }) =>
          state.order.requiresAgeCheck
            ? {
                invoke: {
                  handle: verifyIdentityHandle,
                  input: { customerId: state.order.customerId },
                  resume: "afterAgeVerified",
                },
              }
            : {
                next: {
                  module: "checkout-confirm",
                  entry: "confirm",
                  input: {
                    order: state.order,
                    verification: { token: "skipped", verifiedAt: new Date().toISOString() },
                  },
                },
              },
        cancelled: () => ({ abort: { kind: "abandoned" as const } }),
      },
    },
    "checkout-confirm": {
      confirm: {
        paid: ({ output, state }) => ({
          state: {
            ...state,
            result: { kind: "paid", reference: output.reference, amount: output.amount },
          },
          complete: { kind: "paid", reference: output.reference, amount: output.amount },
        }),
        cancelled: () => ({ abort: { kind: "abandoned" as const } }),
      },
    },
  },

  // Sibling map keyed identically to `transitions` — the runtime looks up
  // `resumes[step.module][step.entry][invokeSpec.resume]` at child terminal
  // time.
  resumes: {
    "checkout-review": {
      review: {
        afterAgeVerified: ({ state, outcome }) =>
          outcome.status === "completed"
            ? {
                state: { ...state, verification: outcome.payload },
                next: {
                  module: "checkout-confirm",
                  entry: "confirm",
                  input: { order: state.order, verification: outcome.payload },
                },
              }
            : {
                // The child aborted (user declined / was force-ended).
                // Surface a discoverable reason and abort the parent.
                abort: {
                  kind: "abandoned" as const,
                  cause: "age-declined",
                  detail: outcome.reason,
                },
              },
      },
    },
  },

  onHydrate: (blob) => {
    if (blob.version !== "1.0.0") {
      throw new Error(`Unknown checkout journey version: ${blob.version}`);
    }
    return blob;
  },
});

export type CheckoutJourney = typeof checkoutJourney;
export const checkoutHandle = defineJourneyHandle(checkoutJourney);
export type CheckoutHandle = typeof checkoutHandle;
