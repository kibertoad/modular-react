import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useJourneyContext } from "@modular-react/journeys";
import type { WorkspaceActions } from "@example-onboarding/app-shared";
import type { WorkspaceTabsState } from "../stores/workspace-tabs.js";
import { hasPersistedJourney } from "../persistence.js";

export interface HomeProps {
  readonly workspace: WorkspaceActions;
  readonly tabsStore: StoreApi<WorkspaceTabsState>;
}

const CUSTOMERS = [
  { id: "C-1", name: "Alice Martin · Orbital Robotics" },
  { id: "C-2", name: "Brent Oduya · Meridian Freight" },
  { id: "C-3", name: "Casey Rivera · Rivera Consulting (profile blocked)" },
];

export function Home({ workspace, tabsStore }: HomeProps) {
  const activeTabId = useSyncExternalStore(
    tabsStore.subscribe,
    () => tabsStore.getState().activeTabId,
  );
  // Mounted by journeysPlugin() — safe to assume non-null here because the
  // shell is configured with the plugin. Keep the null-coalesce only if you
  // have non-journey shells reusing this component.
  const journeyCtx = useJourneyContext();

  if (activeTabId) {
    return null;
  }

  const startOnboarding = (customerId: string, customerName: string) => {
    if (!journeyCtx) {
      throw new Error(
        "[Home] useJourneyContext() returned null — journeysPlugin() must be attached to the registry.",
      );
    }
    const input = { customerId };
    const instanceId = journeyCtx.runtime.start("customer-onboarding", input);
    workspace.addJourneyTab({
      instanceId,
      journeyId: "customer-onboarding",
      input,
      title: `Onboard · ${customerName}`,
    });
  };

  return (
    <div style={{ padding: "1.5rem", flex: 1 }}>
      <h2 style={{ marginBottom: "0.5rem" }}>Customer onboarding</h2>
      <p style={{ color: "#4a5568", marginBottom: "1rem", maxWidth: "55ch" }}>
        Pick a customer to start the journey. State is persisted to <code>localStorage</code> on
        every transition — reload the page mid-flow and the tab resumes at the exact step where you
        left off.
      </p>

      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {CUSTOMERS.map((customer) => {
          const resuming = hasPersistedJourney("customer-onboarding", customer.id);
          return (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => startOnboarding(customer.id, customer.name)}
              >
                {resuming ? "Resume" : "Start"} — {customer.name}{" "}
                <span style={{ color: "#718096" }}>({customer.id})</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p style={{ color: "#718096", fontSize: "0.85rem", marginTop: "1.5rem", maxWidth: "55ch" }}>
        Tip: start customer C-1, click <strong>Pick a plan</strong>, then reload the page. The tab
        strip restores, and clicking the tab (or letting the active tab persist) lands you back
        inside the plan module.
      </p>
    </div>
  );
}
