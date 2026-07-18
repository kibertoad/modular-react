<script setup lang="ts">
import type { ModuleEntryProps } from "@modular-frontend/core";
import type { ConfirmExits } from "./exits.js";
import type { ConfirmInput } from "./types.js";

const props = defineProps<ModuleEntryProps<ConfirmInput, ConfirmExits>>();
</script>

<template>
  <section
    data-testid="step-confirm"
    :style="{ display: 'flex', flexDirection: 'column', gap: '1rem' }"
  >
    <header>
      <h3 :style="{ margin: 0 }">Step 2 · Confirm</h3>
      <p :style="{ margin: '0.25rem 0 0', color: '#4a5568' }">Frame {{ input.frameId }}</p>
    </header>

    <p>
      Plan:
      <strong data-testid="confirm-plan">{{ input.plan.tier }}</strong>
      (${{ input.plan.monthly }}/mo)
    </p>

    <div :style="{ display: 'flex', gap: '0.5rem' }">
      <button v-if="goBack" type="button" data-testid="wizard-back" @click="goBack">← Back</button>
      <button type="button" data-testid="wizard-confirm" @click="exit('confirmed')">Confirm</button>
      <button type="button" data-testid="wizard-cancel" @click="exit('cancelled')">Cancel</button>
    </div>
  </section>
</template>
