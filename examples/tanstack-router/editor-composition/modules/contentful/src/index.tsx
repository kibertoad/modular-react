import { useSyncExternalStore } from "react";
import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { WritableStore } from "@modular-react/core";

interface ContentfulSourceInput {
  readonly documentId: string;
  readonly selectedItem: WritableStore<string | null>;
}

const SAMPLE_ENTRIES = [
  { id: "entry-12", title: "Homepage hero copy" },
  { id: "entry-19", title: "Pricing FAQ" },
  { id: "entry-42", title: "Release notes — v3" },
];

function ContentfulSourcePanel({ input }: { input: ContentfulSourceInput }) {
  const { documentId } = input;
  const selectedItem = useSyncExternalStore(
    input.selectedItem.subscribe,
    input.selectedItem.getSnapshot,
  );
  return (
    <div data-testid="contentful-panel" style={{ padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Contentful</h3>
      <p style={{ color: "#718096", fontSize: "0.875rem" }}>Source items for {documentId}</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {SAMPLE_ENTRIES.map((e) => (
          <li key={e.id} style={{ padding: "0.25rem 0" }}>
            <button
              type="button"
              data-testid={`contentful-${e.id}`}
              aria-pressed={selectedItem === e.id}
              onClick={() => input.selectedItem.set(e.id)}
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
  id: "contentful",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: ContentfulSourcePanel,
      input: schema<ContentfulSourceInput>(),
    }),
  },
});
