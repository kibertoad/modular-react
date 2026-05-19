import { useSyncExternalStore } from "react";
import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { WritableStore } from "@modular-react/core";
import { useCompositionState } from "@modular-react/compositions";
import type { EditorState, SourceId } from "@example-tsr-editor-composition/app-shared";

/** See RR sibling for rationale on the cross-team vs in-team split. */

interface EditorMainInput {
  readonly documentId: string;
  readonly activeSource: WritableStore<SourceId | null>;
}

/**
 * Inspector input: only the host-provided document id. The panel reads
 * the rest of its state through `useCompositionState` — the in-team
 * hooks pattern. Compare with `EditorMainInput` for the cross-team
 * store-projection pattern.
 */
interface InspectorInput {
  readonly documentId: string;
}

function EditorMain({ input }: { input: EditorMainInput }) {
  const { documentId } = input;
  const activeSource = useSyncExternalStore(
    input.activeSource.subscribe,
    input.activeSource.getSnapshot,
  );
  const setSource = input.activeSource.set;
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

function InspectorPanel(_props: { input: InspectorInput }) {
  // In-team hooks pattern — see RR sibling for rationale.
  const activeSource = useCompositionState<EditorState, SourceId | null>((s) => s.activeSource);
  const selectedItem = useCompositionState<EditorState, string | null>((s) => s.selectedSourceItem);
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
      // `WritableStore<SourceId | null>` only the composition
      // selector provides. A journey step that tried to mount this
      // entry would have nowhere to source the store from, so the
      // framework filters it out of `StepSpec` at compile time.
      mountKinds: ["composition"],
    }),
    inspector: defineEntry({
      component: InspectorPanel,
      input: schema<InspectorInput>(),
      // Same reasoning — readable stores are injected by the
      // composition selector.
      mountKinds: ["composition"],
    }),
  },
});
