import { defineEntry, defineModule, schema } from "@modular-react/core";
import { planExits } from "./exits.js";
import { ChoosePlan, type ChoosePlanInput } from "./ChoosePlan.js";

export { planExits };
export type { PlanExits } from "./exits.js";

export default defineModule({
  id: "plan",
  version: "1.0.0",
  meta: {
    name: "Plan",
    description: "Lets the customer pick a subscription tier.",
  },
  exitPoints: planExits,
  entryPoints: {
    choose: defineEntry({
      component: ChoosePlan,
      input: schema<ChoosePlanInput>(),
      // Preserve state when going back to the profile — don't discard the
      // hint the profile module computed for us.
      allowBack: "preserve-state",
    }),
  },
});
