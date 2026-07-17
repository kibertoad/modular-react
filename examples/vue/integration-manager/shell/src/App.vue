<script setup lang="ts">
// Root component. The shell's own routes place `ShellLayout` at "/", which
// renders the sidebar + header chrome and a nested `<router-view>` for module
// routes. This root only needs the top-level outlet.
</script>

<template>
  <router-view />
</template>
