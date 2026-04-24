import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";
import type { PlanTier } from "@example-onboarding/app-shared";

/**
 * A minimal "step-0" module that renders outside any journey. It shows a
 * small menu of workflow options; each option fires a distinct exit. The
 * shell dispatcher (wired via `<ModuleExitProvider>` in main.tsx) is the
 * single place that knows which exit maps to which journey — the module
 * itself stays journey-agnostic.
 *
 * Demonstrates the common real-world step-0 shape — a workflow hub —
 * where each option kicks off a *different* journey. The three exits here
 * map to three distinct journeys in the shell (`customer-onboarding`,
 * `plan-switch`, `quick-bill`). Swapping any exit to a different journey
 * is a one-line change in the shell dispatcher; the launcher module has
 * no idea which journey runs.
 */

export interface PickWorkflowInput {
  /** Optional pre-fill — the launcher uses sensible defaults when absent. */
  readonly defaultCustomerId?: string;
}

export const launcherExits = {
  /** Inbound lead — wire to the full onboarding journey. */
  startOnboarding: defineExit<{ customerId: string; customerName: string }>(),
  /** Existing customer changing plans — wire to the plan-switch journey. */
  startPlanSwitch: defineExit<{
    customerId: string;
    customerName: string;
    currentTier: PlanTier;
  }>(),
  /** Known customer, preset amount — wire to the quick-bill journey. */
  startQuickBill: defineExit<{
    customerId: string;
    customerName: string;
    amount: number;
  }>(),
  /** User backed out — shell should navigate home. */
  cancelled: defineExit(),
} as const;

interface Option {
  readonly title: string;
  readonly description: string;
  readonly run: (exit: (name: string, output: unknown) => void) => void;
}

const OPTIONS: readonly Option[] = [
  {
    title: "New customer onboarding",
    description: "Inbound lead — run the full intake → plan → billing flow.",
    run: (exit) =>
      exit("startOnboarding", {
        customerId: "C-1",
        customerName: "Alice Martin · Orbital Robotics",
      }),
  },
  {
    title: "Existing customer — plan switch",
    description: "Skip intake. Open the plan chooser with their current tier pre-selected.",
    run: (exit) =>
      exit("startPlanSwitch", {
        customerId: "C-2",
        customerName: "Brent Oduya · Meridian Freight",
        currentTier: "standard" as PlanTier,
      }),
  },
  {
    title: "One-off charge (quick bill)",
    description: "Known customer, fixed amount — jump straight to the billing collect step.",
    run: (exit) =>
      exit("startQuickBill", {
        customerId: "C-3",
        customerName: "Casey Rivera · Rivera Consulting",
        amount: 149,
      }),
  },
];

function PickWorkflow({ exit }: ModuleEntryProps<PickWorkflowInput, typeof launcherExits>) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Launch a workflow</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568", maxWidth: "60ch" }}>
          Pure module · rendered via <code>&lt;ModuleRoute&gt;</code>. Each action below emits a
          distinct exit; the composition root is the single place that decides which journey the
          exit maps to.
        </p>
      </header>

      <ul
        style={{
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: 0,
          margin: 0,
        }}
      >
        {OPTIONS.map((opt) => (
          <li
            key={opt.title}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "0.375rem",
              padding: "0.75rem 1rem",
              background: "white",
            }}
          >
            <button
              type="button"
              onClick={() => opt.run(exit as (name: string, output: unknown) => void)}
              style={{ marginBottom: "0.25rem" }}
            >
              {opt.title}
            </button>
            <p style={{ margin: "0.25rem 0 0", color: "#4a5568", fontSize: "0.85rem" }}>
              {opt.description}
            </p>
          </li>
        ))}
      </ul>

      <div>
        <button type="button" onClick={() => exit("cancelled")}>
          Back to home
        </button>
      </div>
    </section>
  );
}

export const launcherModule = defineModule({
  id: "customer-launcher",
  version: "1.0.0",
  meta: {
    name: "Workflow launcher",
    description: "Step-0 workflow picker — routes the user into one of several journeys.",
  },
  navigation: [
    // Plain-URL nav entry — renders in the TopNav alongside the
    // journey-contributed "Start a quick bill" button. Lets the example show
    // both shapes (link + action) in the same navbar renderer.
    { label: "Workflow launcher", to: "/launch", order: 1 },
  ],
  exitPoints: launcherExits,
  entryPoints: {
    pickWorkflow: defineEntry({
      component: PickWorkflow,
      input: schema<PickWorkflowInput>(),
    }),
  },
});

export type LauncherModule = typeof launcherModule;
