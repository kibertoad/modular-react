import type { ModuleEntryProps } from "@modular-react/core";
import type { ProfileExits } from "./exits.js";
import { loadCustomer, selfServeAmount, suggestPlan } from "./data.js";

export interface ReviewProfileInput {
  readonly customerId: string;
}

export function ReviewProfile({ input, exit }: ModuleEntryProps<ReviewProfileInput, ProfileExits>) {
  const customer = loadCustomer(input.customerId);
  const hint = suggestPlan(customer);
  const selfServe = selfServeAmount(customer);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Profile · {customer.name}</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#4a5568" }}>
          <code>{input.customerId}</code> · {customer.company} · {customer.seats}{" "}
          {customer.seats === 1 ? "seat" : "seats"}
        </p>
      </header>

      {customer.readiness === "needs-details" ? (
        <p style={{ color: "#b7791f" }}>
          Blocked — {customer.readinessDetail ?? "missing onboarding details"}.
        </p>
      ) : (
        <p style={{ color: "#2f855a" }}>
          Profile looks good. Suggested tier: <strong>{hint.suggestedTier}</strong> —{" "}
          {hint.rationale}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {customer.readiness === "needs-details" ? (
          <button
            type="button"
            onClick={() =>
              exit("needsMoreDetails", {
                customerId: input.customerId,
                missing: customer.readinessDetail ?? "profile incomplete",
              })
            }
          >
            Flag for back-office
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => exit("profileComplete", { customerId: input.customerId, hint })}
            >
              Pick a plan
            </button>
            {customer.readiness === "self-serve" && (
              <button
                type="button"
                onClick={() =>
                  exit("readyToBuy", {
                    customerId: input.customerId,
                    amount: selfServe,
                  })
                }
              >
                Skip ahead — charge ${selfServe}
              </button>
            )}
          </>
        )}
        <button type="button" onClick={() => exit("cancelled")}>
          Cancel
        </button>
      </div>
    </section>
  );
}
