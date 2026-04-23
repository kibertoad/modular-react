import { useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { PlanHint, PlanTier, SubscriptionPlan } from "@example-onboarding/app-shared";
import type { PlanExits } from "./exits.js";

export interface ChoosePlanInput {
  readonly customerId: string;
  readonly hint: PlanHint;
}

const CATALOG: Readonly<Record<PlanTier, SubscriptionPlan>> = {
  standard: { tier: "standard", monthly: 29 },
  pro: { tier: "pro", monthly: 79 },
  enterprise: { tier: "enterprise", monthly: 199 },
};

const TIER_ORDER: readonly PlanTier[] = ["standard", "pro", "enterprise"];

export function ChoosePlan({ input, exit, goBack }: ModuleEntryProps<ChoosePlanInput, PlanExits>) {
  const [selectedTier, setSelectedTier] = useState<PlanTier>(input.hint.suggestedTier);
  const plan = CATALOG[selectedTier];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Choose a plan · Customer {input.customerId}</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Profile suggested <strong>{input.hint.suggestedTier}</strong> — {input.hint.rationale}
        </p>
      </header>

      <fieldset
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          border: "1px solid #e2e8f0",
          padding: "0.75rem",
          borderRadius: "0.5rem",
        }}
      >
        <legend style={{ padding: "0 0.5rem", color: "#4a5568" }}>Tier</legend>
        {TIER_ORDER.map((tier) => (
          <label key={tier} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <input
              type="radio"
              name="tier"
              checked={selectedTier === tier}
              onChange={() => setSelectedTier(tier)}
            />
            <span style={{ textTransform: "capitalize" }}>{tier}</span>
            <span style={{ color: "#718096" }}>(${CATALOG[tier].monthly}/mo)</span>
          </label>
        ))}
      </fieldset>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={() => exit("choseStandard", { plan })}>
          Charge ${plan.monthly} now · activate
        </button>
        <button type="button" onClick={() => exit("choseWithTrial", { plan })}>
          Start 14-day free trial
        </button>
        <button
          type="button"
          onClick={() => exit("noFit", { reason: "no tier matched the customer's needs" })}
        >
          Flag for back-office
        </button>
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel journey
        </button>
        {goBack && (
          <button type="button" onClick={goBack} style={{ marginLeft: "auto" }}>
            ← Back to profile
          </button>
        )}
      </div>
    </section>
  );
}
