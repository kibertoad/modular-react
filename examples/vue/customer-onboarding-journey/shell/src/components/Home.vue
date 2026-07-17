<script setup lang="ts">
import { useJourneyContext } from "@modular-vue/journeys";
import { customerOnboardingHandle } from "@example-vue-onboarding/customer-onboarding-journey";
import { workspace, workspaceTabs } from "../workspace.js";
import { hasPersistedJourney } from "../persistence.js";

// Provided by the journeys plugin's <JourneyProvider>, threaded into the
// manifest's Providers stack. Non-null because the shell attaches the plugin.
const journeyCtx = useJourneyContext();

const CUSTOMERS = [
  { id: "C-1", name: "Alice Martin · Orbital Robotics" },
  { id: "C-2", name: "Brent Oduya · Meridian Freight" },
  { id: "C-3", name: "Casey Rivera · Rivera Consulting (profile blocked)" },
];

function startOnboarding(customerId: string, customerName: string): void {
  if (!journeyCtx) {
    throw new Error(
      "[Home] useJourneyContext() returned null — journeysPlugin() must be attached to the registry.",
    );
  }
  // Dedup on journeyId+customerId before calling start(). With persistence
  // configured, runtime.start() is itself idempotent via the persistence key,
  // so this guard mostly matters for shells that skip persistence.
  const existing = workspaceTabs.state.tabs.find(
    (t) =>
      t.journeyId === customerOnboardingHandle.id &&
      (t.input as { customerId?: string } | undefined)?.customerId === customerId,
  );
  if (existing) {
    workspaceTabs.activateTab(existing.tabId);
    return;
  }
  const input = { customerId };
  // Handle form — TS enforces `input` matches the journey's declared
  // OnboardingInput. A mismatch fails at compile time.
  const instanceId = journeyCtx.runtime.start(customerOnboardingHandle, input);
  workspace.addJourneyTab({
    instanceId,
    journeyId: customerOnboardingHandle.id,
    input,
    title: `Onboard · ${customerName}`,
  });
}
</script>

<template>
  <div :style="{ padding: '1.5rem', flex: 1 }">
    <h2 :style="{ marginBottom: '0.5rem' }">Customer onboarding</h2>
    <p :style="{ color: '#4a5568', marginBottom: '1rem', maxWidth: '55ch' }">
      Pick a customer to start the journey. State is persisted to <code>localStorage</code> on every
      transition — reload the page mid-flow and the tab resumes at the exact step where you left
      off.
    </p>

    <ul :style="{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }">
      <li v-for="customer in CUSTOMERS" :key="customer.id">
        <button type="button" @click="startOnboarding(customer.id, customer.name)">
          {{ hasPersistedJourney("customer-onboarding", customer.id) ? "Resume" : "Start" }} —
          {{ customer.name }} <span :style="{ color: '#718096' }">({{ customer.id }})</span>
        </button>
      </li>
    </ul>

    <p :style="{ color: '#718096', fontSize: '0.85rem', marginTop: '1.5rem', maxWidth: '55ch' }">
      Tip: start customer C-1, click <strong>Pick a plan</strong>, then reload the page. The tab
      strip restores, and the active tab lands you back inside the plan module at the exact step.
    </p>
  </div>
</template>
