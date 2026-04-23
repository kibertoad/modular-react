import { createRoot } from "react-dom/client";
import { createRegistry } from "@tanstack-react-modules/runtime";
import type { ModuleDescriptor } from "@modular-react/core";
import type { AppDependencies, AppSlots } from "@example-tsr-onboarding/app-shared";
import profileModule from "@example-tsr-onboarding/profile-module";
import planModule from "@example-tsr-onboarding/plan-module";
import billingModule from "@example-tsr-onboarding/billing-module";
import { customerOnboardingJourney } from "@example-tsr-onboarding/customer-onboarding-journey";

import { createWorkspaceTabsStore } from "./stores/workspace-tabs.js";
import { createWorkspaceActions, type RuntimeRef } from "./services/workspace-actions.js";
import { journeyPersistence } from "./persistence.js";
import { createShell } from "./components/Shell.js";
import { HomeOrTab } from "./components/HomeOrTab.js";

const tabsStore = createWorkspaceTabsStore();
const runtimeRef: RuntimeRef = { current: null };
const workspace = createWorkspaceActions(tabsStore, runtimeRef);

// Descriptor map is populated after `registry.resolve()` — the `indexComponent`
// passed into resolve needs to close over this ref, not the destructured value.
const descriptorsRef: {
  current: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
} = { current: {} };

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

const Shell = createShell({ runtimeRef, tabsStore, workspace });

const { App, moduleDescriptors, journeys } = registry.resolve({
  rootComponent: Shell,
  indexComponent: () => (
    <HomeOrTab
      tabsStore={tabsStore}
      workspace={workspace}
      moduleDescriptors={descriptorsRef.current}
    />
  ),
});

runtimeRef.current = journeys;
descriptorsRef.current = moduleDescriptors;

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

createRoot(document.getElementById("root")!).render(<App />);
