import { defineEntry, defineModule, schema } from "@modular-frontend/core";
import EditorMain from "./EditorMain.vue";
import InspectorPanel from "./InspectorPanel.vue";
import type { EditorMainInput, InspectorInput } from "./types.js";

export type { EditorMainInput, InspectorInput } from "./types.js";

export default defineModule({
  id: "editor",
  version: "1.0.0",
  entryPoints: {
    main: defineEntry({
      component: EditorMain,
      input: schema<EditorMainInput>(),
      // Composition-only: the input shape requires a
      // `WritableStore<SourceId | null>` that only the composition selector
      // provides via `stores.writable(...)`. Mounting this entry in a journey
      // step would have nowhere to source that store from, so the framework
      // rejects it at compile time (in any `StepSpec` that targets this module).
      mountKinds: ["composition"],
    }),
    inspector: defineEntry({
      component: InspectorPanel,
      input: schema<InspectorInput>(),
      // Same reasoning as `main` — the inspector reads from composition state
      // injected by the composition's zone selector.
      mountKinds: ["composition"],
    }),
  },
});
