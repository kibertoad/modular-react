<script setup lang="ts">
import { useReactiveStore } from "@example-vue-editor/app-shared";
import type { ContentfulSourceInput } from "./types.js";

const props = defineProps<{ input: ContentfulSourceInput; exit?: () => void }>();

const SAMPLE_ENTRIES = [
  { id: "entry-12", title: "Homepage hero copy" },
  { id: "entry-19", title: "Pricing FAQ" },
  { id: "entry-42", title: "Release notes — v3" },
];

const selectedItem = useReactiveStore(props.input.selectedItem);
</script>

<template>
  <div data-testid="contentful-panel" :style="{ padding: '1rem' }">
    <h3 :style="{ marginTop: 0 }">Contentful</h3>
    <p :style="{ color: '#718096', fontSize: '0.875rem' }">
      Source items for {{ input.documentId }}
    </p>
    <ul :style="{ listStyle: 'none', padding: 0 }">
      <li v-for="entry in SAMPLE_ENTRIES" :key="entry.id" :style="{ padding: '0.25rem 0' }">
        <button
          type="button"
          :data-testid="`contentful-${entry.id}`"
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
