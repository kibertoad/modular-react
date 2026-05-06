import { defineEntry, defineModule, schema } from "@modular-react/core";
import { salesforceExits } from "./exits.js";
import { ConfigureSalesforce, type ConfigureSalesforceInput } from "./ConfigureSalesforce.js";

export { salesforceExits };
export type { SalesforceExits } from "./exits.js";

// `defineModule` without explicit generics: see generic-integration/src/index.ts
// for the rationale.
export default defineModule({
  id: "salesforce",
  version: "1.0.0",
  meta: {
    name: "Salesforce",
    description: "Salesforce-specific OAuth + instance URL configure step.",
  },
  exitPoints: salesforceExits,
  entryPoints: {
    configure: defineEntry({
      component: ConfigureSalesforce,
      input: schema<ConfigureSalesforceInput>(),
    }),
  },
  // No slots / navigation / createRoutes — the catalog page renders the
  // tile from the remote manifest, and the journey reaches this module
  // via `selectModuleOrDefault` against the integration's `id`.
});
