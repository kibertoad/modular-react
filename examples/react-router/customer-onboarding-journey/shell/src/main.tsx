import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import { JourneyProvider } from "@modular-react/journeys";
import type { AppDependencies, AppSlots } from "@example-onboarding/app-shared";
import profileModule from "@example-onboarding/profile-module";
import planModule from "@example-onboarding/plan-module";
import billingModule from "@example-onboarding/billing-module";
import { customerOnboardingJourney } from "@example-onboarding/customer-onboarding-journey";

import { createWorkspaceTabsStore } from "./stores/workspace-tabs.js";
import { createWorkspaceActions, type RuntimeRef } from "./services/workspace-actions.js";
import { journeyPersistence } from "./persistence.js";
import { RootLayout } from "./components/RootLayout.js";
import { TabStrip } from "./components/TabStrip.js";
import { TabContent } from "./components/TabContent.js";
import { Home } from "./components/Home.js";

const tabsStore = createWorkspaceTabsStore();
const runtimeRef: RuntimeRef = { current: null };
const workspace = createWorkspaceActions(tabsStore, runtimeRef);

const registry = createRegistry<AppDependencies, AppSlots>({
  services: { workspace },
  slots: { commands: [] },
});

registry.register(profileModule);
registry.register(planModule);
registry.register(billingModule);

registry.registerJourney(customerOnboardingJourney, {
  persistence: journeyPersistence,
  onTransition: (ev) => {
    // Host-level observability hook — in a real app this goes to analytics.
    console.debug("[journey transition]", ev.journeyId, ev.from?.moduleId, "->", ev.to?.moduleId, ev.exit);
  },
});

const { App, moduleDescriptors, journeys } = registry.resolve({
  rootComponent: Shell,
});

runtimeRef.current = journeys;

// Rehydrate any journey tabs restored from localStorage: calling start() with
// the same input resolves via the persistence adapter and returns the stored
// instance id. If something changed (blob was cleared out-of-band), update
// the tab; if the blob is gone entirely, a fresh instance spins up seamlessly.
{
  const { tabs } = tabsStore.getState();
  for (const tab of tabs) {
    if (tab.kind !== "journey") continue;
    const resolvedId = journeys.start(tab.journeyId, tab.input);
    if (resolvedId !== tab.instanceId) {
      tabsStore.getState().removeTab(tab.tabId);
      tabsStore.getState().addTab({ ...tab, instanceId: resolvedId });
    }
  }
}

function Shell() {
  return (
    <JourneyProvider
      runtime={journeys}
      onModuleExit={(ev) => console.debug("[global module exit]", ev)}
    >
      <RootLayout>
        <TabStrip tabsStore={tabsStore} workspace={workspace} />
        <Home workspace={workspace} tabsStore={tabsStore} />
        <TabContent
          tabsStore={tabsStore}
          workspace={workspace}
          moduleDescriptors={moduleDescriptors}
        />
      </RootLayout>
    </JourneyProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
