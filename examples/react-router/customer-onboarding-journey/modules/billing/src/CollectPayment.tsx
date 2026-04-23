import type { ModuleEntryProps } from "@modular-react/core";
import type { BillingExits } from "./exits.js";

export interface CollectPaymentInput {
  readonly customerId: string;
  readonly amount: number;
}

function makeReference(): string {
  return `PAY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function CollectPayment({
  input,
  exit,
  goBack,
}: ModuleEntryProps<CollectPaymentInput, BillingExits>) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Collect payment · Customer {input.customerId}</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          Amount due <strong>${input.amount}</strong>.
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => exit("paid", { reference: makeReference(), amount: input.amount })}
        >
          Process payment
        </button>
        <button
          type="button"
          onClick={() => exit("failed", { reason: "card declined" })}
        >
          Payment failed
        </button>
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel journey
        </button>
        {goBack && (
          <button type="button" onClick={goBack} style={{ marginLeft: "auto" }}>
            ← Rethink
          </button>
        )}
      </div>

      {goBack && (
        <p style={{ color: "#718096", fontSize: "0.85rem" }}>
          This entry opted into <code>allowBack: 'rollback'</code> — using <strong>Rethink</strong>{" "}
          reverts the journey state to the snapshot taken before payment collection, so any outcome
          recorded upstream is discarded.
        </p>
      )}
    </section>
  );
}
