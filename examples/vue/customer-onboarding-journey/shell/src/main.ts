import { createApp, defineComponent, h } from "vue";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import { createRegistry } from "@modular-vue/runtime";
import { journeysPlugin, UnknownJourneyError } from "@modular-vue/journeys";
import type { AppDependencies, AppSlots } from "@example-vue-onboarding/app-shared";
import profileModule from "@example-vue-onboarding/profile-module";
import planModule from "@example-vue-onboarding/plan-module";
import billingModule from "@example-vue-onboarding/billing-module";
import { customerOnboardingJourney } from "@example-vue-onboarding/customer-onboarding-journey";
import { workspace, workspaceTabs } from "./workspace.js";
import { journeyPersistence } from "./persistence.js";
import WorkspaceView from "./components/WorkspaceView.vue";

// The registry gains journey support via the plugin. `journeysPlugin()` adds
// `registerJourney` and produces the runtime on `manifest.journeys`, and
// `resolveManifest()` threads the plugin's <JourneyProvider> into the Providers
// stack so a <JourneyOutlet> mounted anywhere under it reads the runtime from
// context.
const registry = createRegistry<AppDependencies, AppSlots>({
  stores: {},
  services: { workspace },
  slots: { commands: [] },
}).use(journeysPlugin());

registry.register(profileModule);
registry.register(planModule);
registry.register(billingModule);

registry.registerJourney(customerOnboardingJourney, { persistence: journeyPersistence });

const manifest = registry.resolveManifest();
const journeys = manifest.journeys;

// Rehydrate journey tabs restored from localStorage. Calling start() with the
// same input resolves via the persistence adapter and returns the stored
// instance id. Errors are discriminated:
//   - `UnknownJourneyError` — journey renamed/removed between deploys; drop quietly.
//   - anything else — likely a real bug; warn loudly and drop so the shell still boots.
// `removeTab` / `updateTab` reassign `state.tabs` (never splice in place), so
// iterating the snapshot captured at loop start is safe.
const persistedTabs = workspaceTabs.state.tabs.slice();
for (const tab of persistedTabs) {
  if (!journeys.isRegistered(tab.journeyId)) {
    workspaceTabs.removeTab(tab.tabId);
    continue;
  }
  try {
    const resolvedId = journeys.start(tab.journeyId, tab.input);
    if (resolvedId !== tab.instanceId) {
      workspaceTabs.updateTab(tab.tabId, { instanceId: resolvedId });
    }
  } catch (err) {
    if (!(err instanceof UnknownJourneyError)) {
      console.warn(
        `[shell] Dropping journey tab "${tab.tabId}" (${tab.journeyId}) after rehydration failure:`,
        err,
      );
    }
    workspaceTabs.removeTab(tab.tabId);
  }
}

const router = createRouter({
  history: createWebHistory(),
  // `manifest.routes` is empty here (journey-step modules own no routes), but
  // spreading it keeps the shell correct if a route-owning module is added.
  routes: [{ path: "/", name: "home", component: WorkspaceView }, ...manifest.routes],
});

// The framework-mode root: wrap <router-view> in the manifest's Providers so
// every view injects the modular contexts and the journey runtime.
const Root = defineComponent({
  name: "Root",
  setup: () => () => h(manifest.Providers, null, () => h(RouterView)),
});

const app = createApp(Root);
app.use(router);
app.mount("#app");
