import { useState } from "react";
import { PanelsOutlet } from "@modular-react/react";
import { BOARD, inspectorPanels } from "@example-rr-inspector-panels/app-shared";

/**
 * The host. Local state holds the selected block id; the resolved `BoardBlock`
 * (or `null`) is the **subject** handed to `<PanelsOutlet>`. The outlet reads
 * the group's slot entries from the slots context, filters them by each panel's
 * `when(subject)`, orders them, and renders every match — the shell itself never
 * branches on block type. Adding support for a new block type is a new *module*,
 * not an edit here.
 */
export function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = BOARD.find((b) => b.id === selectedId) ?? null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.5fr",
        minHeight: "70vh",
        borderTop: "1px solid #e2e8f0",
      }}
    >
      <section data-testid="board" style={{ padding: "1rem", borderRight: "1px solid #e2e8f0" }}>
        <h2 style={{ marginTop: 0 }}>Board</h2>
        <p style={{ color: "#718096", fontSize: "0.875rem" }}>
          Select a block. The inspector rail shows every panel whose predicate matches it.
        </p>
        <div role="listbox" aria-label="Board blocks" style={{ display: "grid", gap: "0.5rem" }}>
          {BOARD.map((b) => (
            <button
              key={b.id}
              type="button"
              role="option"
              data-testid={`block-${b.id}`}
              aria-selected={selectedId === b.id}
              onClick={() => setSelectedId(b.id)}
              style={{
                textAlign: "left",
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                border: selectedId === b.id ? "2px solid #3182ce" : "1px solid #cbd5e0",
                background: selectedId === b.id ? "#ebf8ff" : "#fff",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <strong>{b.label}</strong>
              <br />
              <small style={{ color: "#718096" }}>
                {b.level} · {b.type}
              </small>
            </button>
          ))}
          <button
            type="button"
            data-testid="block-none"
            onClick={() => setSelectedId(null)}
            style={{
              padding: "0.375rem 0.75rem",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              font: "inherit",
              color: "#718096",
            }}
          >
            Clear selection
          </button>
        </div>
      </section>

      <aside data-testid="inspector" style={{ padding: "1rem", background: "#fafafa" }}>
        <h2 style={{ marginTop: 0 }}>Inspector</h2>
        <PanelsOutlet
          group={inspectorPanels}
          subject={selected}
          // Fold the block id into each panel's key so switching blocks remounts
          // panel content instead of reusing a stale instance.
          subjectKey={(b) => b.id}
          empty={
            <p data-testid="inspector-empty" style={{ color: "#718096" }}>
              Select a block to inspect it.
            </p>
          }
          // Per-panel chrome. `data-panel` lets the e2e assert render order.
          wrap={({ entry, children }) => (
            <section
              data-testid={`panel-${entry.id}`}
              data-panel={entry.id}
              style={{
                marginBottom: "0.75rem",
                padding: "0.75rem",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#fff",
              }}
            >
              {children}
            </section>
          )}
        />
      </aside>
    </div>
  );
}
