<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <section>
    <h1>{{ title ?? "Insights" }}</h1>
  </section>
</template>
