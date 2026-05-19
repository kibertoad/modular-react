import { CompositionOutlet, useComposition } from "@modular-react/compositions";
import { editorCompositionHandle } from "@example-tsr-editor-composition/editor-composition";

const DOCUMENT_ID = "doc-1";

/**
 * TanStack-Router-side mirror of the RR example's Home — same composition
 * lifecycle (instance minted by `useComposition`, disposal handled by the
 * outlet's refcount) and same three-column zone layout. The composition
 * outlet and the host-side hook are router-agnostic.
 *
 * The typed `editorCompositionHandle` propagates the input shape to the
 * host call site so a typo or missing field is a compile error rather
 * than a runtime validation hit.
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
