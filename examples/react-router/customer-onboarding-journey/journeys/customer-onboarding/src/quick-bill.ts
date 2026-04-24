import { defineJourney, defineJourneyHandle } from "@modular-react/journeys";
import type billingModule from "@example-onboarding/billing-module";

/**
 * Known customer with a preset amount — jump straight to the billing
 * collect step, complete on success, abort on failure or cancel.
 *
 * Demonstrates a single-step journey that wraps one module entry in the
 * journey runtime's lifecycle (persistence, telemetry, tab bookkeeping).
 * Equivalent to "fire-and-forget" billing, but with the same plumbing
 * every other journey uses.
 */

type QuickBillModules = {
  readonly billing: typeof billingModule;
};

export interface QuickBillInput {
  readonly customerId: string;
  readonly amount: number;
}

interface QuickBillState {
  readonly customerId: string;
  readonly amount: number;
}

export const quickBillJourney = defineJourney<QuickBillModules, QuickBillState>()({
  id: "quick-bill",
  version: "1.0.0",
  meta: {
    name: "Quick bill",
    category: "growth",
  },

  initialState: ({ customerId, amount }: QuickBillInput) => ({ customerId, amount }),

  start: (state) => ({
    module: "billing",
    entry: "collect",
    input: { customerId: state.customerId, amount: state.amount },
  }),

  transitions: {
    billing: {
      collect: {
        paid: ({ output }) => ({
          complete: { kind: "paid", reference: output.reference, amount: output.amount },
        }),
        failed: ({ output }) => ({ abort: { reason: "payment-failed", detail: output.reason } }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
    },
  },
});

export const quickBillHandle = defineJourneyHandle(quickBillJourney);
export type QuickBillHandle = typeof quickBillHandle;
