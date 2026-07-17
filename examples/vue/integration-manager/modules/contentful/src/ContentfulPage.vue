<script setup lang="ts">
import { IntegrationManager } from "@example-vue-integration-manager/app-shared";
import { contentfulConfig } from "./config.js";
</script>

<template>
  <IntegrationManager :config="contentfulConfig" />
</template>
