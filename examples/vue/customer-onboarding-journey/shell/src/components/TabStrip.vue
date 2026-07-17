<script setup lang="ts">
import { workspace, workspaceTabs } from "../workspace.js";

const state = workspaceTabs.state;
</script>

<template>
  <nav
    aria-label="Open tabs"
    :style="{
      borderRight: '1px solid #e2e8f0',
      padding: '1rem',
      backgroundColor: 'white',
      minWidth: '240px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }"
  >
    <button
      type="button"
      :style="{
        textAlign: 'left',
        backgroundColor: state.activeTabId === null ? '#ebf8ff' : 'white',
        color: state.activeTabId === null ? '#2b6cb0' : '#2d3748',
        borderColor: state.activeTabId === null ? '#bee3f8' : '#cbd5e0',
      }"
      @click="workspaceTabs.activateTab(null)"
    >
      Home
    </button>

    <hr :style="{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '0.25rem 0' }" />

    <p v-if="state.tabs.length === 0" :style="{ color: '#718096', fontSize: '0.85rem' }">
      No tabs open.
    </p>

    <div
      v-for="tab in state.tabs"
      :key="tab.tabId"
      :style="{ display: 'flex', alignItems: 'stretch', gap: '0.25rem' }"
    >
      <button
        type="button"
        :title="tab.title"
        :style="{
          flex: 1,
          textAlign: 'left',
          backgroundColor: tab.tabId === state.activeTabId ? '#ebf8ff' : 'white',
          color: tab.tabId === state.activeTabId ? '#2b6cb0' : '#2d3748',
          borderColor: tab.tabId === state.activeTabId ? '#bee3f8' : '#cbd5e0',
        }"
        @click="workspaceTabs.activateTab(tab.tabId)"
      >
        {{ tab.title }}
      </button>
      <button
        type="button"
        :aria-label="`Close ${tab.title}`"
        :style="{ padding: '0.4rem 0.5rem' }"
        @click="workspace.closeTab(tab.tabId)"
      >
        ×
      </button>
    </div>
  </nav>
</template>
