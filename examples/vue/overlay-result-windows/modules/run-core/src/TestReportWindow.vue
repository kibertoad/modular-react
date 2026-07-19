<script setup lang="ts">
import { ref } from "vue";
import { useModalBehavior } from "@modular-vue/vue";
import type { StepRef } from "@example-vue-overlay-windows/app-shared";

// The window body — no <Teleport>/backdrop/Escape/focus code for the *window*
// itself; the managed shell owns all of that. What this window *does* own is a
// nested bespoke confirm built on `useModalBehavior`: it registers on the same
// shared overlay stack as the hosted window, so Escape closes the top one first
// (the confirm), then the window — the stacking guarantee, demonstrated with the
// composable the `<OverlayOutlet>` is itself built on.
defineProps<{ subject: StepRef | null }>();

const confirmOpen = ref(false);
const { dialogRef } = useModalBehavior({
  active: () => confirmOpen.value,
  onClose: () => {
    confirmOpen.value = false;
  },
});
</script>

<template>
  <div data-testid="window-body-test-report">
    <p style="margin-top: 0">
      <strong>{{ subject?.label ?? "Unknown step" }}</strong> passed — 42 assertions, 0 failed.
    </p>
    <button type="button" data-testid="open-confirm" @click="confirmOpen = true">
      Discard this run…
    </button>

    <Teleport to="body">
      <div
        v-if="confirmOpen"
        data-testid="confirm-backdrop"
        :style="{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)',
          zIndex: 60,
        }"
        @click.self="confirmOpen = false"
      >
        <div
          ref="dialogRef"
          role="dialog"
          aria-modal="true"
          aria-label="Discard run?"
          tabindex="-1"
          data-testid="confirm-dialog"
          :style="{
            background: '#fff',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            maxWidth: '320px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }"
        >
          <p style="margin-top: 0">Discard this run? This can't be undone.</p>
          <button type="button" data-testid="confirm-cancel" @click="confirmOpen = false">
            Keep it
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
