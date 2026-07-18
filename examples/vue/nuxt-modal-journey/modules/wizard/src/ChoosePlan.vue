<script setup lang="ts">
import { computed, ref } from "vue";
import type { ModuleEntryProps } from "@modular-frontend/core";
import { PLAN_CATALOG, type PlanTier } from "@example-vue-nuxt-modal/app-shared";
import type { ChoosePlanExits } from "./exits.js";
import type { ChoosePlanInput } from "./types.js";

const props = defineProps<ModuleEntryProps<ChoosePlanInput, ChoosePlanExits>>();

const TIERS: readonly PlanTier[] = ["standard", "pro", "enterprise"];
const selectedTier = ref<PlanTier>("standard");
const plan = computed(() => PLAN_CATALOG[selectedTier.value]);
</script>

<template>
  <section
    data-testid="step-choose"
    :style="{ display: 'flex', flexDirection: 'column', gap: '1rem' }"
  >
    <header>
      <h3 :style="{ margin: 0 }">Step 1 · Choose a plan</h3>
      <p :style="{ margin: '0.25rem 0 0', color: '#4a5568' }">Frame {{ input.frameId }}</p>
    </header>

    <fieldset :style="{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }">
      <label v-for="tier in TIERS" :key="tier" :style="{ display: 'flex', gap: '0.25rem' }">
        <input
          type="radio"
          name="tier"
          :value="tier"
          v-model="selectedTier"
          :data-testid="`plan-${tier}`"
        />
        <span :style="{ textTransform: 'capitalize' }">{{ tier }}</span>
        <span :style="{ color: '#718096' }">(${{ PLAN_CATALOG[tier].monthly }}/mo)</span>
      </label>
    </fieldset>

    <div :style="{ display: 'flex', gap: '0.5rem' }">
      <button type="button" data-testid="wizard-continue" @click="exit('chose', { plan })">
        Continue →
      </button>
      <button type="button" data-testid="wizard-cancel" @click="exit('cancelled')">Cancel</button>
    </div>
  </section>
</template>
