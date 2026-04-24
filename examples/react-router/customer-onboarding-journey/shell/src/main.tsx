import { createRoot } from "react-dom/client";
import { Outlet } from "react-router";
import { createRegistry } from "@react-router-modules/runtime";
import { journeysPlugin, UnknownJourneyError } from "@modular-react/journeys";
import type { JourneyRuntime } from "@modular-react/journeys";
import type { ModuleExitEvent } from "@modular-react/react";
import type { AppDependencies, AppSlots, PlanTier } from "@example-onboarding/app-shared";
import profileModule from "@example-onboarding/profile-module";
import planModule from "@example-onboarding/plan-module";
import billingModule from "@example-onboarding/billing-module";
import {
  customerOnboardingHandle,
  customerOnboardingJourney,
  planSwitchHandle,
  planSwitchJourney,
  quickBillHandle,
  quickBillJourney,
} from "@example-onboarding/customer-onboarding-journey";

import { createWorkspaceTabsStore } from "./stores/workspace-tabs.js";
import { createWorkspaceActions } from "./services/workspace-actions.js";
import { journeyPersistence } from "./persistence.js";
import { RootLayout } from "./components/RootLayout.js";
import { TabStrip } from "./components/TabStrip.js";
import { TabContent } from "./components/TabContent.js";
import { Home } from "./components/Home.js";
import { LaunchPage } from "./components/LaunchPage.js";
import { launcherModule } from "./launcher-module.js";

const tabsStore = createWorkspaceTabsStore();
// Pure tab bookkeeping — no journey runtime dep. Starting journeys happens at
// the call site (see Home.tsx and the onModuleExit dispatcher below).
const workspace = createWorkspaceActions(tabsStore);

// Forward references populated right after `registry.resolve()`. The
// dispatcher needs the runtime to start journeys and the router to
// navigate out of `/launch` once a journey is open.
let journeyRuntime: JourneyRuntime | null = null;
let navigateHome: (() => void) | null = null;

function dedupJourneyTab(journeyId: string, customerId: string): boolean {
  const existing = tabsStore
    .getState()
    .tabs.find(
      (t) =>
        t.kind === "journey" &&
        t.journeyId === journeyId &&
        (t.input as { customerId?: string } | undefined)?.customerId === customerId,
    );
  if (existing) {
    tabsStore.getState().activateTab(existing.tabId);
    return true;
  }
  return false;
}

function handleModuleExit(ev: ModuleExitEvent): void {
  console.debug("[global module exit]", ev);
  if (ev.moduleId !== "customer-launcher") return;
  if (!journeyRuntime) return; // defensive — resolve() always runs before any click

  if (ev.exit === "cancelled") {
    navigateHome?.();
    return;
  }

  if (ev.exit === "startOnboarding") {
    const { customerId, customerName } = ev.output as {
      customerId: string;
      customerName: string;
    };
    if (!dedupJourneyTab(customerOnboardingHandle.id, customerId)) {
      const input = { customerId };
      const instanceId = journeyRuntime.start(customerOnboardingHandle, input);
      workspace.addJourneyTab({
        instanceId,
        journeyId: customerOnboardingHandle.id,
        input,
        title: `Onboard · ${customerName}`,
      });
    }
    navigateHome?.();
    return;
  }

  if (ev.exit === "startPlanSwitch") {
    const { customerId, customerName, currentTier } = ev.output as {
      customerId: string;
      customerName: string;
      currentTier: PlanTier;
    };
    if (!dedupJourneyTab(planSwitchHandle.id, customerId)) {
      const input = { customerId, currentTier };
      const instanceId = journeyRuntime.start(planSwitchHandle, input);
      workspace.addJourneyTab({
        instanceId,
        journeyId: planSwitchHandle.id,
        input,
        title: `Plan switch · ${customerName}`,
      });
    }
    navigateHome?.();
    return;
  }

  if (ev.exit === "startQuickBill") {
    const { customerId, customerName, amount } = ev.output as {
      customerId: string;
      customerName: string;
      amount: number;
    };
    if (!dedupJourneyTab(quickBillHandle.id, customerId)) {
      const input = { customerId, amount };
      const instanceId = journeyRuntime.start(quickBillHandle, input);
      workspace.addJourneyTab({
        instanceId,
        journeyId: quickBillHandle.id,
        input,
        title: `Quick bill · ${customerName}`,
      });
    }
    navigateHome?.();
    return;
  }
}

const registry = createRegistry<AppDependencies, AppSlots>({
  services: { workspace },
  slots: { commands: [] },
}).use(
  journeysPlugin({
    onModuleExit: handleModuleExit,
  }),
);

registry.register(profileModule);
registry.register(planModule);
registry.register(billingModule);
registry.register(launcherModule);

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
registry.registerJourney(planSwitchJourney);
registry.registerJourney(quickBillJourney);

const { App, moduleDescriptors, journeys, router } = registry.resolve({
  rootComponent: Shell,
  indexComponent: IndexRoute,
  shellRoutes: () => [
    {
      path: "launch",
      Component: LaunchPage,
    },
  ],
});

journeyRuntime = journeys;
navigateHome = () => {
  void router.navigate("/");
};

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
      <Outlet />
    </RootLayout>
  );
}

function IndexRoute() {
  return (
    <>
      <Home workspace={workspace} tabsStore={tabsStore} />
      <TabContent
        tabsStore={tabsStore}
        workspace={workspace}
        moduleDescriptors={moduleDescriptors}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
