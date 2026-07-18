import { defineEntry, defineModule, schema } from "@modular-frontend/core";
import { choosePlanExits, confirmExits } from "./exits.js";
import ChoosePlan from "./ChoosePlan.vue";
import Confirm from "./Confirm.vue";
import type { ChoosePlanInput, ConfirmInput } from "./types.js";

export { choosePlanExits, confirmExits };
export type { ChoosePlanExits, ConfirmExits } from "./exits.js";
export type { ChoosePlanInput, ConfirmInput } from "./types.js";

// One module, two entries. The journey routes `choosePlan` → `confirm`; a
// single module owning both steps keeps the example lean while still exercising
// step-to-step routing and back navigation.
export default defineModule({
  id: "wizard",
  version: "1.0.0",
  meta: {
    name: "Environment wizard",
    description: "Two-step setup: pick a plan, then confirm.",
  },
  exitPoints: { ...choosePlanExits, ...confirmExits },
  entryPoints: {
    choosePlan: defineEntry({
      component: ChoosePlan,
      input: schema<ChoosePlanInput>(),
    }),
    confirm: defineEntry({
      component: Confirm,
      input: schema<ConfirmInput>(),
      // Going back from confirm preserves the journey state (the chosen plan).
      allowBack: "preserve-state",
    }),
  },
});
