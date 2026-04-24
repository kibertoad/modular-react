import { useSyncExternalStore } from "react";
import { Link } from "react-router";
import type { StoreApi } from "zustand/vanilla";
import { useJourneyContext } from "@modular-react/journeys";
import { customerOnboardingHandle } from "@example-onboarding/customer-onboarding-journey";
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
    // Dedup on journeyId+customerId before calling start(). With persistence
    // configured, runtime.start() is itself idempotent via the persistence
    // key, so this guard mostly matters for shells that skip persistence —
    // without it, a double-click mints two live instances for the same
    // customer and opens two competing tabs.
    const existing = tabsStore
      .getState()
      .tabs.find(
        (t) =>
          t.kind === "journey" &&
          t.journeyId === customerOnboardingHandle.id &&
          (t.input as { customerId?: string } | undefined)?.customerId === customerId,
      );
    if (existing) {
      tabsStore.getState().activateTab(existing.tabId);
      return;
    }
    const input = { customerId };
    // Handle form — TS enforces `input` matches the journey's declared
    // OnboardingInput. A mismatch (e.g. `{ customerId: 123 }`) fails at
    // compile time instead of silently reaching the runtime.
    const instanceId = journeyCtx.runtime.start(customerOnboardingHandle, input);
    workspace.addJourneyTab({
      instanceId,
      journeyId: customerOnboardingHandle.id,
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
              <button type="button" onClick={() => startOnboarding(customer.id, customer.name)}>
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

      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
        Prefer to pick a workflow first? <Link to="/launch">Open the workflow launcher</Link> —
        demonstrates the "step 0" pattern where a module renders as a route and emits exits the
        shell dispatches to distinct journeys.
      </p>
    </div>
  );
}
