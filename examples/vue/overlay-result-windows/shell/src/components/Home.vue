<script setup lang="ts">
import { computed, ref, type VNode } from "vue";
import { OverlayOutlet, useOverlay } from "@modular-vue/vue";
import {
  resultViews,
  type StepRef,
  type WindowMeta,
} from "@example-vue-overlay-windows/app-shared";
import WindowChrome from "./WindowChrome.vue";

// A stable functional component that renders the window-body VNode the outlet
// hands `#wrap`. Defined once (stable identity) so a parent re-render — e.g.
// when a nested overlay pushes the shared stack and bumps the outlet's `isTop`
// — updates the window in place instead of remounting it and dropping its
// local state. (An inline `<component :is="() => children" />` gets a fresh
// identity every render and would remount the window each time.)
const WindowBody = (props: { node: VNode }) => props.node;

// The host. Two pieces of reactive app state drive everything:
//
// - `activeView` — the **id** of the open window, or `null` for closed. This is
//   the whole selection: the overlay host is pick-one, keyed by app state, not
//   by route. The buttons set it; `@close` (backdrop / Escape / the chrome's ✕)
//   clears it. The host never closes itself.
// - `stepIndex` — which run step is selected; the resolved `StepRef` is the
//   **subject** threaded to the active window (as a prop and via provide).
//
// `<OverlayOutlet>` reads the host's windows from the slots context, mounts the
// one whose id equals `active-id` inside the managed modal shell, and hands its
// body to the `#wrap` slot. Every argument passed to `useOverlay` /
// `<OverlayOutlet>` is reactive, so the entry re-resolves as state changes.

const STEPS: readonly StepRef[] = [
  { instanceId: "run-1", stepIndex: 0, label: "Install dependencies" },
  { instanceId: "run-1", stepIndex: 1, label: "Typecheck" },
  { instanceId: "run-1", stepIndex: 2, label: "Unit tests" },
];

const OPENERS: readonly { id: string; label: string; testId: string }[] = [
  { id: "test-report", label: "🧪 Test report", testId: "open-test-report" },
  { id: "run-logs", label: "📜 Run logs", testId: "open-run-logs" },
  { id: "acme:security-report", label: "🛡️ Security report", testId: "open-security-report" },
  // A window id no installed module provides — data, not a crash: the host
  // renders nothing and dev-warns rather than throwing.
  { id: "does-not-exist", label: "👻 Dangling id", testId: "open-dangling" },
];

// The real windows the in-dialog switcher can jump between (the dangling id is
// an opener only, never a switch target).
const SWITCH_TARGETS: readonly { id: string; label: string }[] = [
  { id: "test-report", label: "🧪 Report" },
  { id: "run-logs", label: "📜 Logs" },
  { id: "acme:security-report", label: "🛡️ Security" },
];

const activeView = ref<string | null>(null);
const stepIndex = ref(0);
const selectedStep = computed(() => STEPS[stepIndex.value] ?? null);

// Resolved alongside the outlet only to read the active window's presentation
// metadata (its width variant) so the shell can size the dialog. The outlet
// resolves the same entry internally to mount it.
const active = useOverlay(resultViews, () => activeView.value);
const panelClass = computed(() =>
  (active.value?.meta as WindowMeta | undefined)?.width === "wide"
    ? "ovl-panel ovl-panel--wide"
    : "ovl-panel",
);

// `subject-key` accepts a string as well as a function; a reactive string is the
// cleanest form here (the outlet is non-generic, so a function form would type
// its argument as `unknown`). Folding the step identity into the key makes
// switching steps remount the window body instead of reusing a stale instance.
const subjectKey = computed(() =>
  selectedStep.value ? `${selectedStep.value.instanceId}:${selectedStep.value.stepIndex}` : "none",
);
</script>

<template>
  <div :style="{ padding: '1rem 1.5rem', display: 'grid', gap: '1rem' }">
    <section>
      <h2 :style="{ margin: '0 0 0.25rem' }">Agent run — {{ selectedStep?.instanceId }}</h2>
      <p :style="{ color: '#718096', margin: 0, fontSize: '0.9rem' }">
        Select a step, then open a result window. Exactly one window is open at a time; which one is
        app state. Backdrop click, <kbd>Esc</kbd>, or the ✕ closes it.
      </p>
    </section>

    <section>
      <h3 :style="{ margin: '0 0 0.5rem', fontSize: '0.95rem' }">Steps (the subject)</h3>
      <div role="listbox" aria-label="Run steps" :style="{ display: 'flex', gap: '0.5rem' }">
        <button
          v-for="s in STEPS"
          :key="s.stepIndex"
          type="button"
          role="option"
          :data-testid="`step-${s.stepIndex}`"
          :aria-selected="stepIndex === s.stepIndex"
          :style="{
            padding: '0.4rem 0.75rem',
            borderRadius: '6px',
            border: stepIndex === s.stepIndex ? '2px solid #3182ce' : '1px solid #cbd5e0',
            background: stepIndex === s.stepIndex ? '#ebf8ff' : '#fff',
            cursor: 'pointer',
          }"
          @click="stepIndex = s.stepIndex"
        >
          {{ s.stepIndex }}. {{ s.label }}
        </button>
      </div>
    </section>

    <section>
      <h3 :style="{ margin: '0 0 0.5rem', fontSize: '0.95rem' }">Open a window</h3>
      <div :style="{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }">
        <button
          v-for="o in OPENERS"
          :key="o.id"
          type="button"
          :data-testid="o.testId"
          :aria-pressed="activeView === o.id"
          :style="{
            padding: '0.4rem 0.75rem',
            borderRadius: '6px',
            border: activeView === o.id ? '2px solid #3182ce' : '1px solid #cbd5e0',
            background: '#fff',
            cursor: 'pointer',
          }"
          @click="activeView = o.id"
        >
          {{ o.label }}
        </button>
      </div>
    </section>

    <OverlayOutlet
      :host="resultViews"
      :active-id="activeView"
      :subject="selectedStep"
      :subject-key="subjectKey"
      backdrop-class="ovl-backdrop"
      :panel-class="panelClass"
      @close="activeView = null"
    >
      <template #wrap="{ entry, subject, close, children }">
        <WindowChrome
          :entry="entry"
          :subject="subject"
          :targets="SWITCH_TARGETS"
          @close="close"
          @switch="(id: string) => (activeView = id)"
        >
          <component :is="WindowBody" :node="children" />
        </WindowChrome>
      </template>
      <template #empty>
        <p data-testid="overlay-closed" :style="{ color: '#a0aec0', fontSize: '0.85rem' }">
          No window open.
        </p>
      </template>
    </OverlayOutlet>
  </div>
</template>

<!-- Headless host → the app supplies every pixel. These two classes are the
     whole visual contract, and are global (not scoped) because the host
     teleports its backdrop/panel to <body>, outside this component's scope. -->
<style>
.ovl-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8vh;
  background: rgba(15, 23, 42, 0.7);
}
.ovl-panel {
  width: 100%;
  max-width: 32rem;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  outline: none;
}
.ovl-panel--wide {
  max-width: 48rem;
}
</style>
