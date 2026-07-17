<script setup lang="ts">
import { computed } from "vue";
import type { ModuleEntryProps } from "@modular-frontend/core";
import type { BillingExits } from "./exits.js";
import type { StartTrialInput } from "./types.js";

const props = defineProps<ModuleEntryProps<StartTrialInput, BillingExits>>();

const plan = computed(() => props.input.plan);

function makeTrialId(): string {
  return `TRIAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function trialEndDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString().slice(0, 10);
}
</script>

<template>
  <section :style="{ display: 'flex', flexDirection: 'column', gap: '1rem' }">
    <header>
      <h2 :style="{ margin: 0 }">Start trial · Customer {{ input.customerId }}</h2>
      <p :style="{ margin: '0.25rem 0 0', color: '#4a5568' }">
        <strong :style="{ textTransform: 'capitalize' }">{{ plan.tier }}</strong> trial · no charge
        for 14 days, then <strong>${{ plan.monthly }}/month</strong>.
      </p>
    </header>

    <div :style="{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }">
      <button
        type="button"
        @click="exit('trialActivated', { trialId: makeTrialId(), trialEndsAt: trialEndDate() })"
      >
        Activate trial
      </button>
      <button type="button" @click="exit('failed', { reason: 'trial activation rejected' })">
        Activation rejected
      </button>
      <button type="button" @click="exit('cancelled')">Cancel journey</button>
      <button v-if="goBack" type="button" :style="{ marginLeft: 'auto' }" @click="goBack">
        ← Back
      </button>
    </div>
  </section>
</template>
