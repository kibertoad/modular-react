<script setup lang="ts">
import { useCompositionState } from "@modular-vue/compositions";
import type { EditorState, SourceId } from "@example-vue-editor/app-shared";
import type { InspectorInput } from "./types.js";

// In-team hooks pattern: this module ships alongside the composition package, so
// it imports the composition's `EditorState` shape and reads slices directly
// through `useCompositionState`. No `WritableStore` / `ReadableStore` ceremony in
// the panel's input. Each selector returns a primitive, so `Object.is` snapshot
// equality is automatic — the panel re-renders only when the read slice changes.
defineProps<{ input: InspectorInput; exit?: () => void }>();

const activeSource = useCompositionState<EditorState, SourceId | null>((s) => s.activeSource);
const selectedItem = useCompositionState<EditorState, string | null>((s) => s.selectedSourceItem);
</script>

<template>
  <aside data-testid="inspector" :style="{ padding: '1rem', borderLeft: '1px solid #e2e8f0' }">
    <h3 :style="{ marginTop: 0 }">Inspector</h3>
    <dl>
      <dt>Selected item</dt>
      <dd data-testid="inspector-selected">{{ selectedItem ?? "—" }}</dd>
      <dt>Source</dt>
      <dd data-testid="inspector-source">{{ activeSource ?? "—" }}</dd>
    </dl>
  </aside>
</template>
