import { defineEntry, defineModule, schema } from "@modular-react/core";
import { billingExits } from "./exits.js";
import { CollectPayment, type CollectPaymentInput } from "./CollectPayment.js";
import { StartTrial, type StartTrialInput } from "./StartTrial.js";

export { billingExits };
export type { BillingExits } from "./exits.js";

export default defineModule({
  id: "billing",
  version: "1.0.0",
  meta: {
    name: "Billing",
    description: "Charges the customer or activates a free trial.",
  },
  exitPoints: billingExits,
  entryPoints: {
    collect: defineEntry({
      component: CollectPayment,
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
