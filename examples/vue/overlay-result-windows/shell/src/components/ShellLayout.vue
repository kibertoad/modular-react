<script setup lang="ts">
// The shell chrome: a header and the nested `<router-view>` that renders Home.
</script>

<template>
  <div
    :style="{
      fontFamily: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
      minHeight: '100vh',
    }"
  >
    <header
      :style="{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0', background: '#f7fafc' }"
    >
      <strong>State-keyed overlay host</strong> — Vue Router shell
    </header>
    <main>
      <router-view />
    </main>
  </div>
</template>
