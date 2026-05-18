import { defineEntry, defineModule, schema } from "@modular-react/core";
import { createEditorHooks, type EditorState } from "@example-rr-editor-composition/app-shared";

const { useState: useEditorState, useDispatch: useEditorDispatch } = createEditorHooks();

const SAMPLE_ENTRIES = [
  { id: "entry-12", title: "Homepage hero copy" },
  { id: "entry-19", title: "Pricing FAQ" },
  { id: "entry-42", title: "Release notes — v3" },
];

function ContentfulSourcePanel({ input }: { input: { documentId: string } }) {
  const selected = useEditorState((s: EditorState) => s.selectedSourceItem);
  const dispatch = useEditorDispatch();
  return (
    <div data-testid="contentful-panel" style={{ padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Contentful</h3>
      <p style={{ color: "#718096", fontSize: "0.875rem" }}>Source items for {input.documentId}</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {SAMPLE_ENTRIES.map((e) => (
          <li key={e.id} style={{ padding: "0.25rem 0" }}>
            <button
              type="button"
              data-testid={`contentful-${e.id}`}
              aria-pressed={selected === e.id}
              onClick={() => dispatch({ selectedSourceItem: e.id })}
              style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }}
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
  id: "contentful",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: ContentfulSourcePanel,
      input: schema<{ documentId: string }>(),
    }),
  },
});
