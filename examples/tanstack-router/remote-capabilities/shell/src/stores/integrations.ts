import { createStore } from "zustand/vanilla";
import type {
  IntegrationKind,
  IntegrationsStore,
} from "@example-tsr-remote-capabilities/app-shared";

/**
 * The store that holds remote-fetched manifests + the per-session set of
 * connected integration ids. The integration-catalog module writes to it
 * from `onRegister`; `dynamicSlots(deps)` reads from it; the journey's
 * terminal handler in `IntegrationsPage` writes to `connected`. The shell
 * subscribes the store to `recalculateSlots` so all three drive a
 * standard slot re-merge.
 */
export const integrationsStore = createStore<IntegrationsStore>()((set) => ({
  status: "idle",
  manifests: [],
  connected: new Set<IntegrationKind>(),
  error: null,
  setManifests: (manifests) => set({ manifests, status: "ready", error: null }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  // `Set` is reference-equal to itself across `set()` calls — recreate it
  // each time so `useStore` selectors comparing the slice see the change.
  markConnected: (id) =>
    set((state) => {
      if (state.connected.has(id)) return state;
      const next = new Set(state.connected);
      next.add(id);
      return { connected: next };
    }),
  resetConnected: () => set({ connected: new Set<IntegrationKind>() }),
}));
