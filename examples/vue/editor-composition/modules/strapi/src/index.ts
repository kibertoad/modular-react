import { defineEntry, defineModule, schema } from "@modular-frontend/core";
import SourcePanel from "./SourcePanel.vue";
import type { StrapiSourceInput } from "./types.js";

export type { StrapiSourceInput } from "./types.js";

export default defineModule({
  id: "strapi",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: SourcePanel,
      input: schema<StrapiSourceInput>(),
    }),
  },
});
