<script setup lang="ts">
import { computed, h } from "vue";
import { JourneyOutlet } from "@modular-vue/journeys";
import { workspace, workspaceTabs } from "../workspace.js";

const state = workspaceTabs.state;
const activeTab = computed(() =>
  state.activeTabId === null
    ? null
    : (state.tabs.find((t) => t.tabId === state.activeTabId) ?? null),
);

// `loadingFallback` accepts a VNode factory — rendered while a lazy step
// (e.g. billing/collect) resolves.
const loadingFallback = () => h("div", { style: { color: "#4a5568" } }, "Loading journey…");

function onFinished(): void {
  const tab = activeTab.value;
  if (tab) workspace.closeTab(tab.tabId);
}
</script>

<template>
  <main v-if="activeTab" :style="{ flex: 1, padding: '1.5rem', backgroundColor: '#f7fafc' }">
    <!--
      Runtime + module map come from the <JourneyProvider> threaded into the
      manifest's Providers stack (main.ts) — no prop threading needed. The
      outlet resolves the step component by id against the registered modules.
    -->
    <JourneyOutlet
      :instance-id="activeTab.instanceId"
      :loading-fallback="loadingFallback"
      :on-finished="onFinished"
    />
  </main>
</template>
