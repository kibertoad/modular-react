<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useJourneyInstance } from "@modular-vue/journeys";
import { useUiStore } from "../stores/ui";

const ui = useUiStore();
const { instanceId } = storeToRefs(ui);

// Always-mounted subscription to the active instance. The modal's
// <JourneyOutlet> ends the instance on unmount ONLY when no listener remains
// (`record.listeners.size === 0`); this subscription keeps a listener alive, so
// closing the modal (which unmounts the outlet) leaves the journey running and
// reopening resumes it. Without this, closing would tear the journey down and
// reopening would start fresh.
//
// This is the load-bearing difference from `<JourneyHost>`, which OWNS the
// lifetime and ends the instance on its own unmount — right for a route/tab
// host, wrong for a modal that must survive close.
useJourneyInstance(instanceId);
</script>

<template>
  <span data-testid="journey-keepalive" hidden />
</template>
