import { useSyncExternalStore } from "react";
import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { WritableStore } from "@modular-react/core";
import { useCompositionState } from "@modular-react/compositions";
import type { EditorState, SourceId } from "@example-rr-editor-composition/app-shared";

/**
 * The `main` entry receives `SourceId` through a `WritableStore`
 * injection (the cross-team pattern); the `inspector` entry, owned by
 * the same team as the composition, reads composition state directly
 * through the hooks (the in-team pattern). `SourceId` and `EditorState`
 * are shared via `app-shared` to avoid a workspace cycle between this
 * module and the composition package.
 */

interface EditorMainInput {
  readonly documentId: string;
  readonly activeSource: WritableStore<SourceId | null>;
}

/**
 * Inspector input: only the host-provided document id. Composition
 * state (active source + selected item) is read through
 * `useCompositionState` inside the panel — the in-team hooks pattern.
 * Compare with `EditorMainInput` above for the cross-team store-projection
 * pattern.
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

function InspectorPanel(_props: { input: InspectorInput }) {
  // In-team hooks pattern: this module ships alongside the composition
  // package, so it can import the composition's `EditorState` shape and
  // read slices directly through `useCompositionState`. No
  // `WritableStore` / `ReadableStore` ceremony in the panel's input.
  // Each selector returns a primitive so `Object.is` snapshot equality
  // is automatic — the panel re-renders only when the read slice
  // changes.
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
