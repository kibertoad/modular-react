import { createStore } from "zustand/vanilla";
import type { IntegrationsClient, IntegrationsStore } from "@example-active/app-shared";

/**
 * Swap-topology store factory.
 *
 * The async `selectProject(id)` action lives on the store itself, closing
 * over the injected `IntegrationsClient`. This keeps fetch logic out of UI
 * components and out of the module's `onRegister` hook — the picker simply
 * calls `selectProject(id)` and the store handles status transitions,
 * fetching, and error capture.
 *
 * Accepting the client as an argument (rather than importing a concrete
 * instance) keeps the store testable: pass a stub in tests, a real client
 * in `main.tsx`.
 */
export function createIntegrationsStore(client: IntegrationsClient) {
  return createStore<IntegrationsStore>()((set, get) => ({
    status: "idle",
    activeProjectId: null,
    activeManifest: null,
    error: null,

    async selectProject(projectId) {
      if (projectId == null) {
        set({ status: "idle", activeProjectId: null, activeManifest: null, error: null });
        return;
      }

      set({ status: "loading", activeProjectId: projectId, error: null });
      try {
        const manifest = await client.fetchManifest(projectId);
        // Ignore a stale resolution: if the user has already swapped to a
        // different project, drop this result instead of clobbering the
        // newer fetch's state.
        if (get().activeProjectId !== projectId) return;
        set({ status: "ready", activeManifest: manifest });
      } catch (err) {
        if (get().activeProjectId !== projectId) return;
        const message = err instanceof Error ? err.message : String(err);
        set({ status: "error", error: message, activeManifest: null });
      }
    },
  }));
}
