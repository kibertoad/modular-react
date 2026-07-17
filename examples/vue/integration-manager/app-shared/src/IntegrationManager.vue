<script setup lang="ts">
import type { IntegrationConfig } from "./integrations.js";

/**
 * Generic integration-manager screen. Every sibling integration module
 * renders this with its own `IntegrationConfig`. The component knows nothing
 * about specific integrations — it reads typed config fields and renders.
 *
 * Adding a new integration = adding a new module with its own config. Adding
 * a new capability = adding a new field to IntegrationFeatures and a branch
 * here. No per-integration branching.
 */
defineProps<{ config: IntegrationConfig }>();
</script>

<template>
  <section>
    <header>
      <h1>{{ config.displayName }}</h1>
      <p>Configure and manage content from {{ config.displayName }}.</p>
    </header>

    <table>
      <thead>
        <tr>
          <th v-for="col in config.columns" :key="col.id">{{ col.title }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td v-for="col in config.columns" :key="col.id">
            <em>{{ col.type }} column</em>
          </td>
        </tr>
      </tbody>
    </table>

    <section v-if="config.features.allowAssigningLanguagesToFolders">
      <h2>Language / folder assignment</h2>
      <p>Map languages to folders in the source.</p>
    </section>

    <p v-if="config.features.limitImportToOnlyBaseLanguage" role="note">
      Imports are limited to the base language for this integration.
    </p>

    <section v-if="config.features.supportedImportTags?.length">
      <h2>Available import tags</h2>
      <ul>
        <li v-for="tag in config.features.supportedImportTags" :key="tag.id">{{ tag.title }}</li>
      </ul>
    </section>
  </section>
</template>
