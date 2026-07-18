import type { Pinia } from "pinia";
import { useJourneysStore } from "../stores/journeys";

// Persist the journeys store to localStorage so the Pinia-backed journey blobs
// survive a full reload — a dependency-free stand-in for
// pinia-plugin-persistedstate. This is what makes the persistence adapter's
// LOAD path recover an in-flight journey after refresh (the in-memory instance
// is gone; `runtime.start()` rehydrates from the persisted blob).
const KEY = "example-nuxt-modal:journeys";

export default defineNuxtPlugin({
  name: "journeys-persist",
  enforce: "post",
  setup(nuxtApp) {
    const store = useJourneysStore(nuxtApp.$pinia as Pinia);

    try {
      const raw = localStorage.getItem(KEY);
      if (raw) store.$patch({ journeys: JSON.parse(raw) });
    } catch {
      // Absent / corrupt / access-blocked storage — start empty.
    }

    store.$subscribe((_mutation, state) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state.journeys));
      } catch {
        // Quota / security errors — best-effort.
      }
    });
  },
});
