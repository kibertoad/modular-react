import { defineEntry, defineModule, schema } from "@modular-react/core";
import { chooserExits } from "./exits.js";
import { ChooseIntegration, type ChooseIntegrationInput } from "./ChooseIntegration.js";

export { chooserExits };
export type { ChooserExits } from "./exits.js";

// `defineModule` is called without generics so the descriptor's literal
// type (specifically `entryPoints` / `exitPoints`) survives into `typeof`
// consumers — the journey definition needs those narrow types to derive
// EntryInputOf/ExitOutputOf for transition checking. Slot/dep typing still
// fires at `registry.register(...)` against the registry's TSlots/TDeps.
export default defineModule({
  id: "chooser",
  version: "1.0.0",
  meta: {
    name: "Integration chooser",
    description: "Lets the operator pick which integration to configure.",
  },
  exitPoints: chooserExits,
  entryPoints: {
    pick: defineEntry({
      component: ChooseIntegration,
      input: schema<ChooseIntegrationInput>(),
    }),
  },
});
