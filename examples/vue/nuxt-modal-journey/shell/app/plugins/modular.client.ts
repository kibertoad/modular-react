import type { Pinia } from "pinia";
import { createRegistry } from "@modular-vue/runtime";
import { createPiniaJourneyPersistence, journeysPlugin } from "@modular-vue/journeys";
import { installModularApp } from "@modular-vue/nuxt/runtime";
import wizardModule from "@example-vue-nuxt-modal/wizard-module";
import {
  setupWizardJourney,
  type SetupWizardInput,
  type SetupWizardState,
} from "@example-vue-nuxt-modal/setup-wizard-journey";
import { useJourneysStore } from "../stores/journeys";

/**
 * Client-only Nuxt plugin (Option B: `installModularApp` from a hand-written
 * plugin — the cat-factory shape). `enforce: "post"` so Nuxt's router + Pinia
 * plugins have already run.
 *
 * The load-bearing line is `installModularApp`: it grafts module routes onto
 * Nuxt's router and installs the resolved manifest app-wide via
 * `nuxtApp.vueApp.use(manifest)`. Because the registry carries `journeysPlugin()`,
 * that install ALSO threads the journey runtime app-wide under `journeyKey` via
 * the plugin's `appProvides` hook — so `<JourneyHost>` / `<JourneyOutlet>`
 * mounted inside the modal resolve the runtime from context with **no**
 * `<JourneyProvider>` wrapper anywhere in the tree.
 */
export default defineNuxtPlugin({
  name: "modular",
  enforce: "post",
  setup(nuxtApp) {
    const pinia = nuxtApp.$pinia as Pinia;

    // Journey persistence backed by a Pinia store the app owns. The getter is
    // invoked lazily on load/save, resolved against Nuxt's Pinia instance.
    const persistence = createPiniaJourneyPersistence<SetupWizardInput, SetupWizardState>({
      keyFor: ({ journeyId, input }) => `journey:${input.frameId}:${journeyId}`,
      store: () => useJourneysStore(pinia),
    });

    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(wizardModule);
    registry.registerJourney(setupWizardJourney, { persistence });

    // `installModularApp` grafts module routes onto Nuxt's router and installs
    // the manifest app-wide. `useRouter()` supplies the router (Nuxt owns it;
    // `nuxtApp.$router` exists at runtime but isn't on the `_NuxtApp` type).
    installModularApp({ vueApp: nuxtApp.vueApp, $router: useRouter() }, registry);
  },
});
