import { defineEntry, defineModule, schema } from "@modular-frontend/core";
import SourcePanel from "./SourcePanel.vue";
import type { ContentfulSourceInput } from "./types.js";

export type { ContentfulSourceInput } from "./types.js";

export default defineModule({
  id: "contentful",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: SourcePanel,
      input: schema<ContentfulSourceInput>(),
    }),
  },
});
