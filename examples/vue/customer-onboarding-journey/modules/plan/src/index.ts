import { defineEntry, defineModule, schema } from "@modular-frontend/core";
import { planExits } from "./exits.js";
import ChoosePlan from "./ChoosePlan.vue";
import type { ChoosePlanInput } from "./types.js";

export { planExits };
export type { PlanExits } from "./exits.js";
export type { ChoosePlanInput } from "./types.js";

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
