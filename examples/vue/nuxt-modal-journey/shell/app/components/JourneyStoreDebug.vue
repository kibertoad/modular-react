<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useJourneysStore } from "../stores/journeys";

// Reads the Pinia store that backs `createPiniaJourneyPersistence`, so the e2e
// can assert the adapter actually persisted the in-flight journey (proving the
// save/serialization/keying path — the load path is exercised on reload).
const store = useJourneysStore();
const { journeys } = storeToRefs(store);
const keys = computed(() => Object.keys(journeys.value).sort().join(","));
</script>

<template>
  <span data-testid="persisted-keys" hidden>{{ keys }}</span>
</template>
