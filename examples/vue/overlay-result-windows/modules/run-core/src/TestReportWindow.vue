<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useModalBehavior, useOverlayTicket } from "@modular-vue/vue";
import type { StepRef } from "@example-vue-overlay-windows/app-shared";

// The window body — no <Teleport>/backdrop/Escape/focus code for the *window*
// itself; the managed shell owns all of that. What this window *does* own is a
// nested bespoke confirm built on `useModalBehavior`: it registers on the same
// shared overlay stack as the hosted window, so Escape closes the top one first
// (the confirm), then the window — the stacking guarantee, demonstrated with the
// composable the `<OverlayOutlet>` is itself built on. It also owns a stand-in
// foreign menu that joins the stack through `useOverlayTicket`.
defineProps<{ subject: StepRef | null }>();

const confirmOpen = ref(false);
const { dialogRef } = useModalBehavior({
  active: () => confirmOpen.value,
  onClose: () => {
    confirmOpen.value = false;
  },
});

// A stand-in for another UI library's dropdown (Reka UI, Radix): it closes on
// Escape from its own bubble-phase listener, and only when nothing called
// `preventDefault()`. `useOverlayTicket` holds a ticket on the same stack while
// the menu is open, so the window stands down and the menu gets the key.
const menuOpen = ref(false);
useOverlayTicket(menuOpen);
const onMenuKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape" && !event.defaultPrevented) menuOpen.value = false;
};
watch(menuOpen, (open) => {
  if (open) document.addEventListener("keydown", onMenuKeydown);
  else document.removeEventListener("keydown", onMenuKeydown);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onMenuKeydown));
</script>

<template>
  <div data-testid="window-body-test-report">
    <p style="margin-top: 0">
      <strong>{{ subject?.label ?? "Unknown step" }}</strong> passed — 42 assertions, 0 failed.
    </p>
    <button type="button" data-testid="open-confirm" @click="confirmOpen = true">
      Discard this run…
    </button>
    <button type="button" data-testid="open-menu" @click="menuOpen = !menuOpen">Actions ▾</button>
    <div
      v-if="menuOpen"
      role="menu"
      data-testid="foreign-menu"
      :style="{
        marginTop: '0.5rem',
        padding: '0.25rem',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        maxWidth: '200px',
      }"
    >
      <button type="button" role="menuitem" @click="menuOpen = false">Re-run step</button>
    </div>

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
