import { useEffect, useState } from "react";
import { CompositionOutlet, useCompositionsContext } from "@modular-react/compositions";

const DOCUMENT_ID = "doc-1";

/**
 * TanStack-Router-side mirror of the RR example's Home — same composition
 * lifecycle (mint on mount, end on cleanup) and same three-column zone
 * layout. The composition outlet is router-agnostic.
 */
export function Home() {
  const ctx = useCompositionsContext();
  if (!ctx) {
    throw new Error(
      "<Home> expected a <CompositionsProvider> ancestor — wired by the compositionsPlugin().",
    );
  }
  const runtime = ctx.runtime;

  const [instanceId, setInstanceId] = useState<string | null>(null);
  useEffect(() => {
    const id = runtime.start("editor", { documentId: DOCUMENT_ID });
    setInstanceId(id);
    return () => {
      runtime.end(id);
    };
  }, [runtime]);

  if (!instanceId) return <p style={{ padding: "1rem" }}>Loading composition…</p>;

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
