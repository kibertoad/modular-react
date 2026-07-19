<script setup lang="ts">
import { resolveOverlayTitle, type OverlayEntry } from "@modular-vue/core";
import type { StepRef, WindowMeta } from "@example-vue-overlay-windows/app-shared";

// The app's chrome around a window body — the whole of the `#wrap` slot. The
// headless host renders only the backdrop and the dialog panel; everything
// *inside* the dialog (header, icon, title, switcher, close button) is drawn
// here. Icon comes from the opaque `entry.meta`; the title text is
// `resolveOverlayTitle(entry, subject)` — the same value the host wired to the
// dialog's `aria-label`. The switcher jumps between windows without closing (it
// sets the active id to a sibling); it lives inside the dialog because the
// backdrop covers the page behind it.
const props = defineProps<{
  entry: OverlayEntry<StepRef, WindowMeta>;
  subject: StepRef | null;
  targets: readonly { readonly id: string; readonly label: string }[];
}>();

defineEmits<{ close: []; switch: [id: string] }>();
</script>

<template>
  <div>
    <header
      :style="{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.875rem 1.25rem',
        borderBottom: '1px solid #e2e8f0',
      }"
    >
      <span data-testid="overlay-icon" aria-hidden :style="{ fontSize: '1.1rem' }">
        {{ props.entry.meta?.icon }}
      </span>
      <h2 data-testid="overlay-title" :style="{ margin: 0, fontSize: '1.05rem', flex: 1 }">
        {{ resolveOverlayTitle(props.entry, props.subject) }}
      </h2>
      <button
        type="button"
        data-testid="overlay-close"
        aria-label="Close"
        :style="{
          border: 'none',
          background: 'transparent',
          fontSize: '1.1rem',
          cursor: 'pointer',
          lineHeight: 1,
          padding: '0.25rem 0.5rem',
        }"
        @click="$emit('close')"
      >
        ✕
      </button>
    </header>

    <nav
      aria-label="Switch window"
      :style="{
        display: 'flex',
        gap: '0.375rem',
        padding: '0.5rem 1.25rem',
        borderBottom: '1px solid #edf2f7',
        background: '#f8fafc',
      }"
    >
      <button
        v-for="t in props.targets"
        :key="t.id"
        type="button"
        :data-testid="`switch-${t.id}`"
        :aria-current="t.id === props.entry.id"
        :disabled="t.id === props.entry.id"
        :style="{
          padding: '0.2rem 0.6rem',
          borderRadius: '5px',
          border: '1px solid #cbd5e0',
          background: t.id === props.entry.id ? '#e2e8f0' : '#fff',
          cursor: t.id === props.entry.id ? 'default' : 'pointer',
          fontSize: '0.8125rem',
        }"
        @click="$emit('switch', t.id)"
      >
        {{ t.label }}
      </button>
    </nav>

    <div :style="{ padding: '1rem 1.25rem' }">
      <slot />
    </div>
  </div>
</template>
