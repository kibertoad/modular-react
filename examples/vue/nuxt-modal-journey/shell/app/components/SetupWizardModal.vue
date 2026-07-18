<script setup lang="ts">
import { storeToRefs } from "pinia";
import { JourneyOutlet } from "@modular-vue/journeys";
import { useUiStore } from "../stores/ui";

const ui = useUiStore();
const { isOpen, instanceId } = storeToRefs(ui);

// Terminal exit (confirm → complete) — clear the instance and close.
function onFinished() {
  ui.finish();
}
</script>

<template>
  <div
    v-if="isOpen && instanceId"
    data-testid="wizard-modal"
    :style="{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }"
  >
    <div
      :style="{
        background: '#fff',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        minWidth: '24rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }"
    >
      <!--
        A plain <JourneyOutlet> renders the current step of an instance we
        started ourselves (see useWizardControls). No <JourneyProvider>: the
        runtime is provided app-wide by installModularApp via the journeys
        plugin's appProvides hook, and the outlet reads it from context.
      -->
      <JourneyOutlet :instance-id="instanceId" :on-finished="onFinished" />

      <!-- Closing only hides the modal. The keep-alive subscription
           (JourneyKeepAlive) holds the instance, so reopening resumes it. -->
      <button type="button" data-testid="wizard-close" @click="ui.close()">
        Close (progress kept)
      </button>
    </div>
  </div>
</template>
