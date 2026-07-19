<script setup lang="ts">
import type { StepRef } from "@example-vue-overlay-windows/app-shared";

defineProps<{ subject: StepRef | null }>();
</script>

<template>
  <div data-testid="window-body-acme-security-report">
    <p style="margin-top: 0">
      Compliance scan for <strong>{{ subject?.label ?? "the run" }}</strong> — secrets last rotated
      3 days ago, no findings.
    </p>
  </div>
</template>
