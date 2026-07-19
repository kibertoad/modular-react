<script setup lang="ts">
// Root component. The shell's own routes place `ShellLayout` at "/", which
// renders the header chrome and a nested `<router-view>` for the index route
// (`Home`). This root only needs the top-level outlet.
</script>

<template>
  <router-view />
</template>
