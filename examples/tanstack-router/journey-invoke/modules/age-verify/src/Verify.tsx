import { useEffect, useRef, useState } from "react";
import type { ModuleEntryProps } from "@modular-react/core";
import type { AgeVerifyExits } from "./exits.js";

export interface VerifyInput {
  readonly customerId: string;
}

export function Verify({ input, exit }: ModuleEntryProps<VerifyInput, AgeVerifyExits>) {
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );
  return (
    <section
      style={{
        padding: "1.5rem",
        border: "2px dashed #f59e0b",
        borderRadius: "0.5rem",
        background: "#fffbeb",
      }}
    >
      <header style={{ marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.75rem", color: "#92400e", textTransform: "uppercase" }}>
          Sub-flow · age verification
        </span>
        <h2 style={{ margin: "0.25rem 0" }}>Are you 18 or older?</h2>
      </header>
      <p style={{ color: "#78350f", margin: "0 0 1rem 0" }}>
        We need to verify your age before completing checkout for customer{" "}
        <code>{input.customerId}</code>. This is a separate journey running inside the parent
        checkout — when it completes, the parent picks up exactly where it left off with the
        verification token in hand.
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          disabled={confirming}
          onClick={() => {
            setConfirming(true);
            timeoutRef.current = window.setTimeout(() => {
              timeoutRef.current = null;
              exit("verified", {
                token: `age-${Math.random().toString(36).slice(2, 10)}`,
                verifiedAt: new Date().toISOString(),
              });
            }, 250);
          }}
          style={primaryButton}
        >
          {confirming ? "Verifying…" : "Yes, I am 18+"}
        </button>
        <button
          type="button"
          disabled={confirming}
          onClick={() => exit("declined", { reason: "user-declined" })}
          style={secondaryButton}
        >
          No / cancel
        </button>
      </div>
    </section>
  );
}

const primaryButton = {
  padding: "0.5rem 1rem",
  background: "#d97706",
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
