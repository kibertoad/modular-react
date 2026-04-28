import { defineEntry, defineModule, schema } from "@modular-react/core";
import { pickerExits } from "./exits.js";
import { ChooseIntegration, type ChooseIntegrationInput } from "./ChooseIntegration.js";

export { pickerExits };
export type { PickerExits } from "./exits.js";

// `defineModule` is called without generics so the descriptor's literal
// type (specifically `entryPoints` / `exitPoints`) survives into `typeof`
// consumers — the journey definition needs those narrow types to derive
// EntryInputOf/ExitOutputOf for transition checking. Slot/dep typing still
// fires at `registry.register(...)` against the registry's TSlots/TDeps.
export default defineModule({
  id: "integration-picker",
  version: "1.0.0",
  meta: {
    name: "Integration picker",
    description: "Lets the operator pick which integration to configure.",
  },
  exitPoints: pickerExits,
  entryPoints: {
    pick: defineEntry({
      component: ChooseIntegration,
      input: schema<ChooseIntegrationInput>(),
    }),
  },
});
