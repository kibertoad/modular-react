import type { ModuleEntryProps } from "@modular-react/core";
import type { OrderSummary } from "@example-tsr-invoke/app-shared";
import type { ReviewExits } from "./exits.js";

export interface ReviewInput {
  readonly order: OrderSummary;
}

export function Review({ input, exit }: ModuleEntryProps<ReviewInput, ReviewExits>) {
  const { order } = input;
  return (
    <section
      style={{
        padding: "1.5rem",
        border: "1px solid #cbd5e1",
        borderRadius: "0.5rem",
        background: "white",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Review order</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem" }}>
        <dt>Order</dt>
        <dd>
          <code>{order.orderId}</code>
        </dd>
        <dt>Item</dt>
        <dd>{order.itemName}</dd>
        <dt>Amount</dt>
        <dd>${order.amount.toFixed(2)}</dd>
      </dl>
      {order.requiresAgeCheck ? (
        <p style={{ color: "#92400e", marginTop: "1rem" }}>
          ⚠️ This item requires age verification before checkout can complete.
        </p>
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button
          type="button"
          onClick={() => exit("confirmAge", { orderId: order.orderId })}
          style={primaryButton}
        >
          Proceed
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
  background: "#2563eb",
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
