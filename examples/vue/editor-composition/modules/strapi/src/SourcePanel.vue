<script setup lang="ts">
import { useReactiveStore } from "@example-vue-editor/app-shared";
import type { StrapiSourceInput } from "./types.js";

const props = defineProps<{ input: StrapiSourceInput; exit?: () => void }>();

const SAMPLE_ENTRIES = [
  { id: "post-1", title: "Welcome post" },
  { id: "post-7", title: "Quarterly roadmap" },
  { id: "post-9", title: "Compliance update" },
];

const selectedItem = useReactiveStore(props.input.selectedItem);
</script>

<template>
  <div data-testid="strapi-panel" :style="{ padding: '1rem' }">
    <h3 :style="{ marginTop: 0 }">Strapi</h3>
    <p :style="{ color: '#718096', fontSize: '0.875rem' }">
      Source posts for {{ input.documentId }}
    </p>
    <ul :style="{ listStyle: 'none', padding: 0 }">
      <li v-for="entry in SAMPLE_ENTRIES" :key="entry.id" :style="{ padding: '0.25rem 0' }">
        <button
          type="button"
          :data-testid="`strapi-${entry.id}`"
          :aria-pressed="selectedItem === entry.id"
          :style="{
            background: 'none',
            border: 0,
            padding: 0,
            color: 'inherit',
            font: 'inherit',
            cursor: 'pointer',
            textDecoration: 'underline',
          }"
          @click="input.selectedItem.set(entry.id)"
        >
          {{ entry.title }}
        </button>
      </li>
    </ul>
  </div>
</template>
