import type { ModuleEntryProps } from "@modular-react/core";
import type { SubscriptionPlan } from "@example-onboarding/app-shared";
import type { BillingExits } from "./exits.js";

export interface StartTrialInput {
  readonly customerId: string;
  readonly plan: SubscriptionPlan;
}

function makeTrialId(): string {
  return `TRIAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function trialEndDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString().slice(0, 10);
}

export function StartTrial({
  input,
  exit,
  goBack,
}: ModuleEntryProps<StartTrialInput, BillingExits>) {
  const { plan } = input;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Start trial · Customer {input.customerId}</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          <strong style={{ textTransform: "capitalize" }}>{plan.tier}</strong> trial · no charge for
          14 days, then <strong>${plan.monthly}/month</strong>.
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() =>
            exit("trialActivated", { trialId: makeTrialId(), trialEndsAt: trialEndDate() })
          }
        >
          Activate trial
        </button>
        <button
          type="button"
          onClick={() => exit("failed", { reason: "trial activation rejected" })}
        >
          Activation rejected
        </button>
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel journey
        </button>
        {goBack && (
          <button type="button" onClick={goBack} style={{ marginLeft: "auto" }}>
            ← Back
          </button>
        )}
      </div>
    </section>
  );
}
