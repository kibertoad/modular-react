import { createStore } from "zustand/vanilla";
import type { IntegrationsStore } from "@example/app-shared";

/**
 * The store that holds remote-fetched manifests. The integrations module
 * writes into it from its `onRegister` hook; `dynamicSlots(deps)` reads from
 * it; and the shell subscribes it to `manifest.recalculateSlots` so slots
 * re-merge whenever the manifest list changes.
 */
export const integrationsStore = createStore<IntegrationsStore>()((set) => ({
  status: "idle",
  manifests: [],
  error: null,
  setManifests: (manifests) => set({ manifests, status: "ready", error: null }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
}));
