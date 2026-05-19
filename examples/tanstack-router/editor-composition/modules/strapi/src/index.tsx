import { defineEntry, defineModule, schema } from "@modular-react/core";
import { createEditorHooks, type EditorState } from "@example-tsr-editor-composition/app-shared";

const { useState: useEditorState, useDispatch: useEditorDispatch } = createEditorHooks();

const SAMPLE_ENTRIES = [
  { id: "post-1", title: "Welcome post" },
  { id: "post-7", title: "Quarterly roadmap" },
  { id: "post-9", title: "Compliance update" },
];

function StrapiSourcePanel({ input }: { input: { documentId: string } }) {
  const selected = useEditorState((s: EditorState) => s.selectedSourceItem);
  const dispatch = useEditorDispatch();
  return (
    <div data-testid="strapi-panel" style={{ padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Strapi</h3>
      <p style={{ color: "#718096", fontSize: "0.875rem" }}>Source posts for {input.documentId}</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {SAMPLE_ENTRIES.map((e) => (
          <li key={e.id} style={{ padding: "0.25rem 0" }}>
            <button
              type="button"
              data-testid={`strapi-${e.id}`}
              aria-pressed={selected === e.id}
              onClick={() => dispatch({ selectedSourceItem: e.id })}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                color: "inherit",
                font: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {e.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default defineModule({
  id: "strapi",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: StrapiSourcePanel,
      input: schema<{ documentId: string }>(),
    }),
  },
});
