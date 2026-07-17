<script setup lang="ts">
// Root layout: a header band and the nested outlet for the index route.
</script>

<template>
  <div
    :style="{
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif',
      margin: 0,
      padding: 0,
      minHeight: '100vh',
    }"
  >
    <header
      :style="{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f7fafc' }"
    >
      <strong>Editor composition</strong> — Vue Router shell
    </header>
    <main>
      <router-view />
    </main>
  </div>
</template>
