import type { ModuleEntryProps } from "@modular-react/core";
import type { OrderSummary, AgeVerificationToken } from "@example-tsr-invoke/app-shared";
import type { ConfirmExits } from "./exits.js";

export interface ConfirmInput {
  readonly order: OrderSummary;
  readonly verification: AgeVerificationToken;
}

export function Confirm({ input, exit }: ModuleEntryProps<ConfirmInput, ConfirmExits>) {
  const { order, verification } = input;
  return (
    <section
      style={{
        padding: "1.5rem",
        border: "1px solid #cbd5e1",
        borderRadius: "0.5rem",
        background: "white",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Confirm payment</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem" }}>
        <dt>Order</dt>
        <dd>
          <code>{order.orderId}</code>
        </dd>
        <dt>Item</dt>
        <dd>{order.itemName}</dd>
        <dt>Amount</dt>
        <dd>${order.amount.toFixed(2)}</dd>
        <dt>Verified</dt>
        <dd>
          <code>{verification.token}</code> at{" "}
          {new Date(verification.verifiedAt).toLocaleTimeString()}
        </dd>
      </dl>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button
          type="button"
          onClick={() =>
            exit("paid", {
              reference: `pay-${Math.random().toString(36).slice(2, 10)}`,
              amount: order.amount,
            })
          }
          style={primaryButton}
        >
          Pay
        </button>
        <button type="button" onClick={() => exit("cancelled")} style={secondaryButton}>
          Cancel
        </button>
      </div>
    </section>
  );
}

const primaryButton = {
  padding: "0.5rem 1rem",
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: "0.25rem",
  cursor: "pointer",
};

const secondaryButton = {
  padding: "0.5rem 1rem",
  background: "white",
  color: "#475569",
  border: "1px solid #cbd5e1",
  borderRadius: "0.25rem",
  cursor: "pointer",
};
