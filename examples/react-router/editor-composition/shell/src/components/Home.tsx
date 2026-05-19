import { CompositionOutlet, useComposition } from "@modular-react/compositions";
import { editorCompositionHandle } from "@example-rr-editor-composition/editor-composition";

const DOCUMENT_ID = "doc-1";

/**
 * Home route — mints the composition instance with `useComposition` and
 * renders `<CompositionOutlet>` with a three-column layout. The layout
 * render-prop is the *only* place that knows the composition has a
 * `main` / `source` / `inspector` zone layout — the panel modules and
 * the composition definition stay layout-agnostic.
 *
 * The typed `editorCompositionHandle` (a `defineCompositionHandle` token
 * exported alongside the composition definition) propagates the
 * `{ documentId: string }` input type to `useComposition`, so a missing
 * or wrong-shaped `input` is a compile error here at the host call
 * site. The string-id overload (`useComposition("editor", input)`) is
 * the dynamic fallback when the composition id isn't known at compile
 * time.
 *
 * No `useEffect` here: `useComposition` is a thin lazy-ref wrapper that
 * calls `runtime.start()` exactly once on first render and lets the
 * outlet's attach/detach refcount handle disposal when the Home route
 * unmounts. See the package README for the rationale.
 */
export function Home() {
  const instanceId = useComposition(editorCompositionHandle, { documentId: DOCUMENT_ID });

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
