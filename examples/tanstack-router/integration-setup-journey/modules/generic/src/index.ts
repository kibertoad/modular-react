import { defineEntry, defineModule, schema } from "@modular-react/core";
import { genericExits } from "./exits.js";
import { ConfigureGeneric, type ConfigureGenericInput } from "./ConfigureGeneric.js";

export { genericExits };
export type { GenericExits } from "./exits.js";

// `defineModule` without generics: see chooser/src/index.ts for the rationale.
export default defineModule({
  id: "generic",
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
  // No slot contribution — the generic module is reached through the
  // journey's fallback dispatch, not by the user picking it from the list.
});
