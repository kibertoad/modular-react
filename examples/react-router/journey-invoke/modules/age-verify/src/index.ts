import { defineEntry, defineModule, schema } from "@modular-react/core";
import { Verify } from "./Verify.js";
import type { VerifyInput } from "./Verify.js";
import { ageVerifyExits } from "./exits.js";

export { ageVerifyExits };
export type { AgeVerifyExits } from "./exits.js";
export type { VerifyInput };

export default defineModule({
  id: "age-verify",
  version: "1.0.0",
  meta: {
    name: "Age verify",
    description: "Confirms the user meets the age threshold for the order.",
  },
  exitPoints: ageVerifyExits,
  entryPoints: {
    confirm: defineEntry({
      component: Verify,
      input: schema<VerifyInput>(),
    }),
  },
});
