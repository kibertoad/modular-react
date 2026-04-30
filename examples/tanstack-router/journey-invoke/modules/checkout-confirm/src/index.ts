import { defineEntry, defineModule, schema } from "@modular-react/core";
import { Confirm } from "./Confirm.js";
import type { ConfirmInput } from "./Confirm.js";
import { confirmExits } from "./exits.js";

export { confirmExits };
export type { ConfirmExits } from "./exits.js";
export type { ConfirmInput };

export default defineModule({
  id: "checkout-confirm",
  version: "1.0.0",
  meta: {
    name: "Checkout confirm",
    description: "Final confirm step after age verification has succeeded.",
  },
  exitPoints: confirmExits,
  entryPoints: {
    confirm: defineEntry({
      component: Confirm,
      input: schema<ConfirmInput>(),
    }),
  },
});
