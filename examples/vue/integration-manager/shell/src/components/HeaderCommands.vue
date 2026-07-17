<script setup lang="ts">
import { useRouteData } from "@modular-vue/runtime";
import type { AppRouteData } from "@example-vue-integration-manager/app-shared";

/**
 * Shell zone that adapts to the currently active integration's config.
 * Reads the route `meta` via the typed generic on `useRouteData` — no
 * branching on integration id, just typed feature-flag checks.
 *
 * The shell knows nothing about Contentful/Strapi/GitHub specifically.
 * Adding a fourth integration changes nothing here: the module declares its
 * features, and this component decides what UI to show based on them.
 *
 * `useRouteData` returns a `ComputedRef`; it recomputes on navigation because
 * `route.matched` is reactive. In the template a top-level ref is
 * auto-unwrapped, so `routeData.integration` reads the merged value.
 */
const routeData = useRouteData<AppRouteData>();
</script>

<template>
  <h2 v-if="!routeData.integration" :style="{ margin: 0 }">Welcome</h2>

  <div v-else :style="{ display: 'flex', alignItems: 'center', gap: '12px' }">
    <h2 :style="{ margin: 0 }">{{ routeData.pageTitle ?? routeData.integration.displayName }}</h2>

    <button v-if="routeData.integration.features.allowAssigningLanguagesToFolders" type="button">
      Assign languages to folders…
    </button>

    <button v-if="routeData.integration.features.limitImportToOnlyBaseLanguage" type="button">
      Import base language only
    </button>

    <label v-if="routeData.integration.features.showSkipEmptyOptionOnImport">
      <input type="checkbox" /> Skip empty on import
    </label>

    <span
      v-if="typeof routeData.integration.features.maxBatchSize === 'number'"
      aria-label="Max batch size"
    >
      Batch: {{ routeData.integration.features.maxBatchSize }}
    </span>
  </div>
</template>
