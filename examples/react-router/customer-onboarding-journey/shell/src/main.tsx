import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import { journeysPlugin, UnknownJourneyError } from "@modular-react/journeys";
import type { AppDependencies, AppSlots } from "@example-onboarding/app-shared";
import profileModule from "@example-onboarding/profile-module";
import planModule from "@example-onboarding/plan-module";
import billingModule from "@example-onboarding/billing-module";
import { customerOnboardingJourney } from "@example-onboarding/customer-onboarding-journey";

import { createWorkspaceTabsStore } from "./stores/workspace-tabs.js";
import { createWorkspaceActions } from "./services/workspace-actions.js";
import { journeyPersistence } from "./persistence.js";
import { RootLayout } from "./components/RootLayout.js";
import { TabStrip } from "./components/TabStrip.js";
import { TabContent } from "./components/TabContent.js";
import { Home } from "./components/Home.js";

const tabsStore = createWorkspaceTabsStore();
// Pure tab bookkeeping — no journey runtime dep. Starting journeys happens at
// the call site (see Home.tsx) so there's no chicken-and-egg at construction.
const workspace = createWorkspaceActions(tabsStore);

const registry = createRegistry<AppDependencies, AppSlots>({
  services: { workspace },
  slots: { commands: [] },
}).use(
  journeysPlugin({
    onModuleExit: (ev) => console.debug("[global module exit]", ev),
  }),
);

registry.register(profileModule);
registry.register(planModule);
registry.register(billingModule);

registry.registerJourney(customerOnboardingJourney, {
  persistence: journeyPersistence,
  onTransition: (ev) => {
    // Host-level observability hook — in a real app this goes to analytics.
    console.debug(
      "[journey transition]",
      ev.journeyId,
      ev.from?.moduleId,
      "->",
      ev.to?.moduleId,
      ev.exit,
    );
  },
});

const { App, moduleDescriptors, journeys } = registry.resolve({
  rootComponent: Shell,
});

// Rehydrate any journey tabs restored from localStorage: calling start() with
// the same input resolves via the persistence adapter and returns the stored
// instance id. If something changed (blob was cleared out-of-band), update
// the tab; if the blob is gone entirely, a fresh instance spins up seamlessly.
//
// Errors are discriminated:
//   - `UnknownJourneyError` — the journey was renamed/removed between deploys.
//     Expected after version skew; drop the tab quietly.
//   - anything else — likely a real bug (corrupted input, throwing onHydrate,
//     invariant violation). Warn loudly and drop so the shell still boots.
//
// A production shell should surface the dropped-tab count to the user instead
// of relying on console — see README.md "Rehydration" section.
{
  const { tabs } = tabsStore.getState();
  for (const tab of tabs) {
    if (tab.kind !== "journey") continue;
    if (!journeys.isRegistered(tab.journeyId)) {
      console.debug(
        `[shell] Dropping journey tab "${tab.tabId}" — journey "${tab.journeyId}" is no longer registered.`,
      );
      tabsStore.getState().removeTab(tab.tabId);
      continue;
    }
    try {
      const resolvedId = journeys.start(tab.journeyId, tab.input);
      if (resolvedId !== tab.instanceId) {
        // Update in place so the tab keeps its original slot in the strip.
        tabsStore.getState().updateTab(tab.tabId, { instanceId: resolvedId });
      }
    } catch (err) {
      if (err instanceof UnknownJourneyError) {
        // Races with a concurrent unregister; treat same as the pre-check.
        tabsStore.getState().removeTab(tab.tabId);
        continue;
      }
      console.warn(
        `[shell] Dropping journey tab "${tab.tabId}" (${tab.journeyId}) after rehydration failure:`,
        err,
      );
      tabsStore.getState().removeTab(tab.tabId);
    }
  }
}

function Shell() {
  return (
    <RootLayout>
      <TabStrip tabsStore={tabsStore} workspace={workspace} />
      <Home workspace={workspace} tabsStore={tabsStore} />
      <TabContent
        tabsStore={tabsStore}
        workspace={workspace}
        moduleDescriptors={moduleDescriptors}
      />
    </RootLayout>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
