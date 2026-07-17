<script setup lang="ts">
import { IntegrationManager } from "@example-vue-integration-manager/app-shared";
import { githubConfig } from "./config.js";
</script>

<template>
  <IntegrationManager :config="githubConfig" />
</template>
