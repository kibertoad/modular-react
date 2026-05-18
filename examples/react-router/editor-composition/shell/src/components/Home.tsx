import { useEffect, useState } from "react";
import { CompositionOutlet, useCompositionsContext } from "@modular-react/compositions";

const DOCUMENT_ID = "doc-1";

/**
 * Home route — starts an instance of the `editor` composition on mount,
 * then renders `<CompositionOutlet>` with a three-column layout. The
 * layout render-prop is the *only* place that knows the composition has
 * a `main` / `source` / `inspector` zone layout — the panel modules and
 * the composition definition stay layout-agnostic.
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
    // Mint the instance on mount and `end` it on unmount. The outlet's
    // attach/detach refcount would also dispose the instance when the
    // last outlet leaves, but explicitly calling `end()` here keeps the
    // StrictMode mount/unmount/mount dance from leaking the first
    // instance: we end it on the simulated unmount, then `start` a
    // fresh one on the second mount.
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
