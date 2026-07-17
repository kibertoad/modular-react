<script setup lang="ts">
import { IntegrationManager } from "@example-vue-integration-manager/app-shared";
import { strapiConfig } from "./config.js";
</script>

<template>
  <IntegrationManager :config="strapiConfig" />
</template>
