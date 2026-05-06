import { defineEntry, defineModule, schema } from "@modular-react/core";
import { hubspotExits } from "./exits.js";
import { ConfigureHubspot, type ConfigureHubspotInput } from "./ConfigureHubspot.js";

export { hubspotExits };
export type { HubspotExits } from "./exits.js";

// `defineModule` without explicit generics: see generic-integration/src/index.ts.
export default defineModule({
  id: "hubspot",
  version: "1.0.0",
  meta: {
    name: "HubSpot",
    description: "HubSpot-specific portal id + private-app token configure step.",
  },
  exitPoints: hubspotExits,
  entryPoints: {
    configure: defineEntry({
      component: ConfigureHubspot,
      input: schema<ConfigureHubspotInput>(),
    }),
  },
});
