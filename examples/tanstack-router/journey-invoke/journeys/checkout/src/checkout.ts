import { defineJourney, defineJourneyHandle, invoke } from "@modular-react/journeys";
import type { OrderSummary, AgeVerificationToken } from "@example-tsr-invoke/app-shared";
import type checkoutReviewModule from "@example-tsr-invoke/checkout-review-module";
import type checkoutConfirmModule from "@example-tsr-invoke/checkout-confirm-module";
import { verifyIdentityHandle } from "@example-tsr-invoke/verify-identity-journey";

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
  readonly result: {
    readonly kind: "paid";
    readonly reference: string;
    readonly amount: number;
  } | null;
}

export type CheckoutOutput =
  | { readonly kind: "paid"; readonly reference: string; readonly amount: number }
  | { readonly kind: "abandoned" };

export const checkoutJourney = defineJourney<CheckoutModules, CheckoutState, CheckoutOutput>()({
  id: "checkout",
  version: "1.0.0",
  meta: {
    name: "Checkout (with age verification)",
    ownerTeam: "checkout",
    domain: "commerce",
    tags: ["checkout"],
    status: "stable",
  },
  invokes: [verifyIdentityHandle],

  initialState: ({ order }: CheckoutInput) => ({ order, verification: null, result: null }),

  start: (state) => ({
    module: "checkout-review",
    entry: "review",
    input: { order: state.order },
  }),

  transitions: {
    "checkout-review": {
      review: {
        confirmAge: ({ state }) =>
          state.order.requiresAgeCheck
            ? invoke({
                handle: verifyIdentityHandle,
                input: { customerId: state.order.customerId },
                resume: "afterAgeVerified",
              })
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
