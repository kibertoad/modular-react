<script setup lang="ts">
import RootLayout from "./RootLayout.vue";
import TabStrip from "./TabStrip.vue";
import Home from "./Home.vue";
import TabContent from "./TabContent.vue";
import { workspaceTabs } from "../workspace.js";

const state = workspaceTabs.state;
</script>

<template>
  <RootLayout>
    <TabStrip />
    <!-- Home when no tab is active; the active journey tab's outlet otherwise. -->
    <Home v-if="state.activeTabId === null" />
    <TabContent v-else />
  </RootLayout>
</template>
