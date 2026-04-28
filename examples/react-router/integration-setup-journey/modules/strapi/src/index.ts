import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { IntegrationOption } from "@example-rr-integration-setup/app-shared";
import { strapiExits } from "./exits.js";
import { ConfigureStrapi, type ConfigureStrapiInput } from "./ConfigureStrapi.js";

export { strapiExits };
export type { StrapiExits } from "./exits.js";

const integrationContribution = [
  {
    id: "strapi",
    label: "Strapi",
    description: "Self-hosted CMS with bearer-token auth.",
  },
] as const satisfies readonly IntegrationOption[];

// `defineModule` without generics: see integration-picker/src/index.ts for the rationale.
export default defineModule({
  id: "strapi",
  version: "1.0.0",
  meta: {
    name: "Strapi",
    description: "Self-hosted Strapi CMS with API token auth.",
  },
  exitPoints: strapiExits,
  entryPoints: {
    configure: defineEntry({
      component: ConfigureStrapi,
      input: schema<ConfigureStrapiInput>(),
    }),
  },
  slots: {
    integrations: integrationContribution,
  },
});
