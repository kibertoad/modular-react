import { CompositionOutlet, useComposition } from "@modular-react/compositions";

const DOCUMENT_ID = "doc-1";

/**
 * Home route — mints the composition instance with `useComposition` and
 * renders `<CompositionOutlet>` with a three-column layout. The layout
 * render-prop is the *only* place that knows the composition has a
 * `main` / `source` / `inspector` zone layout — the panel modules and
 * the composition definition stay layout-agnostic.
 *
 * No `useEffect` here: `useComposition` is a thin lazy-ref wrapper that
 * calls `runtime.start()` exactly once on first render and lets the
 * outlet's attach/detach refcount handle disposal when the Home route
 * unmounts. See the package README for the rationale.
 */
export function Home() {
  const instanceId = useComposition("editor", { documentId: DOCUMENT_ID });

  return (
    <CompositionOutlet compositionId="editor" instanceId={instanceId}>
      {(zones) => (
        <div
          data-testid="composition-root"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr 1fr",
            minHeight: "70vh",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <section
            data-testid="zone-source"
            style={{ borderRight: "1px solid #e2e8f0", background: "#fafafa" }}
          >
            {zones.source}
          </section>
          <section data-testid="zone-main">{zones.main}</section>
          <section
            data-testid="zone-inspector"
            style={{ borderLeft: "1px solid #e2e8f0", background: "#fafafa" }}
          >
            {zones.inspector}
          </section>
        </div>
      )}
    </CompositionOutlet>
  );
}
