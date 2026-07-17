<script setup lang="ts">
import { computed } from "vue";
import type { ModuleEntryProps } from "@modular-frontend/core";
import type { ProfileExits } from "./exits.js";
import type { ReviewProfileInput } from "./types.js";
import { loadCustomer, selfServeAmount, suggestPlan } from "./data.js";

// A journey step is a module entry component. The outlet passes
// `{ input, exit, goBack, goForward }` — the exact `ModuleEntryProps` shape.
// `exit` is typed against this module's own exit vocabulary.
const props = defineProps<ModuleEntryProps<ReviewProfileInput, ProfileExits>>();

const customer = computed(() => loadCustomer(props.input.customerId));
const hint = computed(() => suggestPlan(customer.value));
const selfServe = computed(() => selfServeAmount(customer.value));
</script>

<template>
  <section :style="{ display: 'flex', flexDirection: 'column', gap: '1rem' }">
    <header>
      <h2 :style="{ margin: 0 }">Profile · {{ customer.name }}</h2>
      <p :style="{ margin: '0.25rem 0 0', color: '#4a5568' }">
        <code>{{ input.customerId }}</code> · {{ customer.company }} · {{ customer.seats }}
        {{ customer.seats === 1 ? "seat" : "seats" }}
      </p>
    </header>

    <p v-if="customer.readiness === 'needs-details'" :style="{ color: '#b7791f' }">
      Blocked — {{ customer.readinessDetail ?? "missing onboarding details" }}.
    </p>
    <p v-else :style="{ color: '#2f855a' }">
      Profile looks good. Suggested tier: <strong>{{ hint.suggestedTier }}</strong> —
      {{ hint.rationale }}
    </p>

    <div :style="{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }">
      <button
        v-if="customer.readiness === 'needs-details'"
        type="button"
        @click="
          exit('needsMoreDetails', {
            customerId: input.customerId,
            missing: customer.readinessDetail ?? 'profile incomplete',
          })
        "
      >
        Flag for back-office
      </button>
      <template v-else>
        <button
          type="button"
          @click="exit('profileComplete', { customerId: input.customerId, hint })"
        >
          Pick a plan
        </button>
        <button
          v-if="customer.readiness === 'self-serve'"
          type="button"
          @click="exit('readyToBuy', { customerId: input.customerId, amount: selfServe })"
        >
          Skip ahead — charge ${{ selfServe }}
        </button>
      </template>
      <button type="button" @click="exit('cancelled')">Cancel</button>
    </div>
  </section>
</template>
