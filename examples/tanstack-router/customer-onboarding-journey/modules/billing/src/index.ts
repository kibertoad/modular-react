import { defineEntry, defineModule, schema } from "@modular-react/core";
import { billingExits } from "./exits.js";
import type { CollectPaymentInput } from "./CollectPayment.js";
import { StartTrial, type StartTrialInput } from "./StartTrial.js";

export { billingExits };
export type { BillingExits } from "./exits.js";
export type { CollectPaymentInput } from "./CollectPayment.js";

export default defineModule({
  id: "billing",
  version: "1.0.0",
  meta: {
    name: "Billing",
    description: "Charges the customer or activates a free trial.",
    ownerTeam: "billing-platform",
    domain: "finance",
    tags: ["payments"],
    status: "stable",
  },
  exitPoints: billingExits,
  entryPoints: {
    // Lazy-loaded — `CollectPayment` is only fetched when a journey actually
    // reaches the `collect` step (or when an outlet preloads it during idle
    // time, see the journey definition's `defineTransition({ targets })`
    // annotations). Eliminates the bundle cost of the payment-collection
    // surface for journeys that branch into `startTrial` instead.
    collect: defineEntry({
      lazy: () => import("./CollectPayment.js").then((m) => ({ default: m.CollectPayment })),
      input: schema<CollectPaymentInput>(),
      // Rollback: if the rep steps back from `collect`, the journey state
      // reverts to the snapshot taken before entering it — any "paid"
      // outcome recorded upstream is discarded.
      allowBack: "rollback",
    }),
    startTrial: defineEntry({
      component: StartTrial,
      input: schema<StartTrialInput>(),
      allowBack: "preserve-state",
    }),
  },
});
