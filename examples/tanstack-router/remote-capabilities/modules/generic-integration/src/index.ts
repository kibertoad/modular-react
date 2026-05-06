import { defineEntry, defineModule, schema } from "@modular-react/core";
import { genericExits } from "./exits.js";
import { ConfigureGeneric, type ConfigureGenericInput } from "./ConfigureGeneric.js";

export { genericExits };
export type { GenericExits } from "./exits.js";

// `defineModule` without explicit generics: the descriptor's literal types
// (entryPoints + exitPoints) survive into `typeof` consumers — the journey
// definition needs those narrow types to derive `EntryInputOf` /
// `ExitOutputOf` for transition checking. Slot/dep typing still fires when
// the shell calls `registry.register(...)` against the registry's TSlots/TDeps.
export default defineModule({
  id: "generic-integration",
  version: "1.0.0",
  meta: {
    name: "Generic integration",
    description: "Fallback configure step for integrations without a dedicated module.",
  },
  exitPoints: genericExits,
  entryPoints: {
    configure: defineEntry({
      component: ConfigureGeneric,
      input: schema<ConfigureGenericInput>(),
    }),
  },
  // No slot contribution and no createRoutes — the catalog's slot is fed by
  // remote manifests, and this module is reached only through the journey.
});
