<script setup lang="ts">
import { useWizardControls } from "../composables/useWizardControls";

// The single route. Two buttons stand in for two board frames. Opening the
// wizard is just calling `open(frameId)` — no navigation.
const { open } = useWizardControls();
</script>

<template>
  <main :style="{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '34rem' }">
    <header>
      <h1 :style="{ margin: 0 }">Nuxt modal-mounted journey</h1>
      <p :style="{ color: '#4a5568' }">
        A journey hosted in a modal — no URL, Pinia-backed persistence, and the runtime threaded
        app-wide by <code>installModularApp</code> (via the journeys plugin's
        <code>appProvides</code>). There is no <code>&lt;JourneyProvider&gt;</code>
        anywhere; the outlet resolves the runtime from app-level context.
      </p>
    </header>

    <div :style="{ display: 'flex', gap: '0.5rem' }">
      <button type="button" data-testid="open-frame-a" @click="open('A')">Configure Frame A</button>
      <button type="button" data-testid="open-frame-b" @click="open('B')">Configure Frame B</button>
    </div>
  </main>
</template>
