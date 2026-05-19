import { useSyncExternalStore } from "react";
import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { ReadableStore, WritableStore } from "@modular-react/core";

/**
 * Source-integration id the editor canvas knows about. Declared inline
 * because this module owns the chooser UI — the host supplies stores
 * carrying values drawn from this set. The module imports nothing
 * composition-specific.
 */
type SourceId = "contentful" | "strapi";

interface EditorMainInput {
  readonly documentId: string;
  readonly activeSource: WritableStore<SourceId | null>;
}

interface InspectorInput {
  readonly documentId: string;
  readonly activeSource: ReadableStore<SourceId | null>;
  readonly selectedItem: ReadableStore<string | null>;
}

function EditorMain({ input }: { input: EditorMainInput }) {
  const { documentId } = input;
  const activeSource = useSyncExternalStore(
    input.activeSource.subscribe,
    input.activeSource.getSnapshot,
  );
  const setSource = input.activeSource.set;
  // Per-instance group name: if two editor compositions render on the
  // same page, native radio grouping would let the most-recent click
  // bleed across instances. Scope by documentId so each instance owns
  // its own radio group.
  const groupName = `source-${documentId}`;

  return (
    <section data-testid="editor-main" style={{ padding: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Editor — {documentId}</h2>
      <p>Document body goes here. Pick a source integration to mount in the side panel:</p>
      <div role="radiogroup" aria-label="Source integration" data-testid="source-chooser">
        <Choice
          label="Contentful"
          value="contentful"
          name={groupName}
          active={activeSource === "contentful"}
          onSelect={setSource}
        />
        <Choice
          label="Strapi"
          value="strapi"
          name={groupName}
          active={activeSource === "strapi"}
          onSelect={setSource}
        />
        <Choice
          label="None"
          value={null}
          name={groupName}
          active={activeSource === null}
          onSelect={setSource}
        />
      </div>
    </section>
  );
}

function Choice({
  label,
  value,
  name,
  active,
  onSelect,
}: {
  label: string;
  value: SourceId | null;
  name: string;
  active: boolean;
  onSelect: (next: SourceId | null) => void;
}) {
  return (
    <label style={{ display: "block", padding: "0.25rem 0" }}>
      <input
        type="radio"
        name={name}
        checked={active}
        onChange={() => onSelect(value)}
        data-testid={`source-choice-${value ?? "none"}`}
      />{" "}
      {label}
    </label>
  );
}

function InspectorPanel({ input }: { input: InspectorInput }) {
  const activeSource = useSyncExternalStore(
    input.activeSource.subscribe,
    input.activeSource.getSnapshot,
  );
  const selectedItem = useSyncExternalStore(
    input.selectedItem.subscribe,
    input.selectedItem.getSnapshot,
  );
  return (
    <aside data-testid="inspector" style={{ padding: "1rem", borderLeft: "1px solid #e2e8f0" }}>
      <h3 style={{ marginTop: 0 }}>Inspector</h3>
      <dl>
        <dt>Selected item</dt>
        <dd data-testid="inspector-selected">{selectedItem ?? "—"}</dd>
        <dt>Source</dt>
        <dd data-testid="inspector-source">{activeSource ?? "—"}</dd>
      </dl>
    </aside>
  );
}

export default defineModule({
  id: "editor",
  version: "1.0.0",
  entryPoints: {
    main: defineEntry({
      component: EditorMain,
      input: schema<EditorMainInput>(),
      // Composition-only: the input shape requires a
      // `WritableStore<SourceId | null>` that only the composition
      // selector provides via `stores.writable(...)`. Mounting this
      // entry in a journey step would have nowhere to source that
      // store from, so the framework rejects it at compile time
      // (in any `StepSpec` that targets this module).
      mountKinds: ["composition"],
    }),
    inspector: defineEntry({
      component: InspectorPanel,
      input: schema<InspectorInput>(),
      // Same reasoning as `main` — the inspector reads from
      // `ReadableStore`s injected by the composition's zone selector.
      mountKinds: ["composition"],
    }),
  },
});
