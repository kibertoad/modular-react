<script setup lang="ts">
// Chrome around the workspace: a header band plus a flex row for the default
// slot (tab strip + active tab body).
</script>

<template>
  <div :style="{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }">
    <header
      :style="{
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: 'white',
      }"
    >
      <span :style="{ fontSize: '0.875rem', color: '#4a5568' }">
        Customer Onboarding Journey — <code>@modular-vue/journeys</code> example
      </span>
    </header>
    <div :style="{ flex: 1, display: 'flex', minHeight: 0 }">
      <slot />
    </div>
  </div>
</template>
