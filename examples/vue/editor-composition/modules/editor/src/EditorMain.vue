<script setup lang="ts">
import { computed } from "vue";
import { useReactiveStore, type SourceId } from "@example-vue-editor/app-shared";
import type { EditorMainInput } from "./types.js";

// Cross-team pattern: the panel receives a `WritableStore<SourceId | null>` via
// `input.activeSource` — it reads it reactively and writes with `.set(...)`,
// never seeing the composition's state shape. `exit` is passed by the outlet as
// a no-op for composition panels (they communicate via dispatch/emit).
const props = defineProps<{ input: EditorMainInput; exit?: () => void }>();

const activeSource = useReactiveStore(props.input.activeSource);

// Per-instance group name: if two editor compositions render on the same page,
// native radio grouping would let the most-recent click bleed across instances.
// Scope by documentId so each instance owns its own radio group.
const groupName = computed(() => `source-${props.input.documentId}`);

const CHOICES: { readonly label: string; readonly value: SourceId | null }[] = [
  { label: "Contentful", value: "contentful" },
  { label: "Strapi", value: "strapi" },
  { label: "None", value: null },
];

function select(value: SourceId | null): void {
  props.input.activeSource.set(value);
}
</script>

<template>
  <section data-testid="editor-main" :style="{ padding: '1rem' }">
    <h2 :style="{ marginTop: 0 }">Editor — {{ input.documentId }}</h2>
    <p>Document body goes here. Pick a source integration to mount in the side panel:</p>
    <div role="radiogroup" aria-label="Source integration" data-testid="source-chooser">
      <label
        v-for="choice in CHOICES"
        :key="choice.value ?? 'none'"
        :style="{ display: 'block', padding: '0.25rem 0' }"
      >
        <input
          type="radio"
          :name="groupName"
          :checked="activeSource === choice.value"
          :data-testid="`source-choice-${choice.value ?? 'none'}`"
          @change="select(choice.value)"
        />
        {{ choice.label }}
      </label>
    </div>
  </section>
</template>
