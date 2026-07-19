<script setup lang="ts">
import { useOverlaySubject } from "@modular-vue/vue";
import type { StepRef } from "@example-vue-overlay-windows/app-shared";

// Reads the subject from context via `useOverlaySubject` (a reactive computed)
// — no prop-drilling. The returned ref auto-unwraps in the template below.
const step = useOverlaySubject<StepRef>();
</script>

<template>
  <div data-testid="window-body-run-logs">
    <pre
      style="
        margin: 0;
        padding: 0.75rem;
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 6px;
        font-size: 0.8125rem;
        overflow-x: auto;
      "
    >
[step {{ step?.stepIndex ?? "?" }}] {{ step?.label ?? "" }}
&gt; resolving modules… ok
&gt; mounting shell… ok
&gt; exit 0</pre
    >
  </div>
</template>
