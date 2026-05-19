import { defineEntry, defineModule, schema } from "@modular-react/core";
import {
  createEditorHooks,
  type EditorState,
  type SourceId,
} from "@example-rr-editor-composition/editor-composition";

const { useState: useEditorState, useDispatch: useEditorDispatch } = createEditorHooks();

/**
 * Main canvas: shows the document id and the chooser for which source
 * integration to mount in the side zone. Dispatches into the composition's
 * scoped store via `useCompositionDispatch` — the source zone selector
 * picks the new value up on its next render.
 */
function EditorMain({ input }: { input: { documentId: string } }) {
  const activeSource = useEditorState((s: EditorState) => s.activeSource);
  const dispatch = useEditorDispatch();
  const set = (next: SourceId | null) => dispatch({ activeSource: next });
  // Per-instance group name: if two editor compositions render on the
  // same page, native radio grouping would let the most-recent click
  // bleed across instances. Scope by documentId so each instance owns
  // its own radio group.
  const groupName = `source-${input.documentId}`;

  return (
    <section data-testid="editor-main" style={{ padding: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Editor — {input.documentId}</h2>
      <p>Document body goes here. Pick a source integration to mount in the side panel:</p>
      <div role="radiogroup" aria-label="Source integration" data-testid="source-chooser">
        <Choice
          label="Contentful"
          value="contentful"
          name={groupName}
          active={activeSource === "contentful"}
          onSelect={set}
        />
        <Choice
          label="Strapi"
          value="strapi"
          name={groupName}
          active={activeSource === "strapi"}
          onSelect={set}
        />
        <Choice
          label="None"
          value={null}
          name={groupName}
          active={activeSource === null}
          onSelect={set}
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

/**
 * Inspector panel: reads `selectedSourceItem` and `activeSource` from
 * composition state. Sibling source panels write `selectedSourceItem` via
 * dispatch; this zone updates automatically.
 */
function InspectorPanel() {
  const selected = useEditorState((s: EditorState) => s.selectedSourceItem);
  const activeSource = useEditorState((s: EditorState) => s.activeSource);
  return (
    <aside data-testid="inspector" style={{ padding: "1rem", borderLeft: "1px solid #e2e8f0" }}>
      <h3 style={{ marginTop: 0 }}>Inspector</h3>
      <dl>
        <dt>Selected item</dt>
        <dd data-testid="inspector-selected">{selected ?? "—"}</dd>
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
      input: schema<{ documentId: string }>(),
    }),
    inspector: defineEntry({
      component: InspectorPanel,
      input: schema<{ documentId: string }>(),
    }),
  },
});
