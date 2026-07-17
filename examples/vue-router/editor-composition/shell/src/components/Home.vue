<script setup lang="ts">
import { CompositionOutlet, useComposition } from "@modular-vue/compositions";
import { editorCompositionHandle } from "@example-vue-editor/editor-composition";

const DOCUMENT_ID = "doc-1";

// `useComposition` mints the instance once (reads the runtime from the
// <CompositionsProvider> threaded into the manifest's Providers) and returns its
// id. The typed handle propagates the `{ documentId }` input type, so a wrong
// input is a compile error here at the host call site.
const instanceId = useComposition(editorCompositionHandle, { documentId: DOCUMENT_ID });
</script>

<template>
  <!--
    The scoped default slot is the render-prop analog: the outlet hands the host
    a `{ [zoneName]: VNode }` map, and this is the ONLY place that knows the
    composition has a main / source / inspector layout. Panel modules and the
    composition definition stay layout-agnostic. Each zone VNode is rendered with
    `<component :is>`.
  -->
  <CompositionOutlet composition-id="editor" :instance-id="instanceId">
    <template #default="zones">
      <div
        data-testid="composition-root"
        :style="{
          display: 'grid',
          gridTemplateColumns: '1fr 1.5fr 1fr',
          minHeight: '70vh',
          borderTop: '1px solid #e2e8f0',
        }"
      >
        <section
          data-testid="zone-source"
          :style="{ borderRight: '1px solid #e2e8f0', background: '#fafafa' }"
        >
          <component :is="zones.source" />
        </section>
        <section data-testid="zone-main"><component :is="zones.main" /></section>
        <section
          data-testid="zone-inspector"
          :style="{ borderLeft: '1px solid #e2e8f0', background: '#fafafa' }"
        >
          <component :is="zones.inspector" />
        </section>
      </div>
    </template>
  </CompositionOutlet>
</template>
