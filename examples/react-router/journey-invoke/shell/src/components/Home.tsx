import { useState } from "react";
import { JourneyOutlet, useJourneyCallStack } from "@modular-react/journeys";
import type { JourneyRuntime, TerminalOutcome } from "@modular-react/journeys";
import type { OrderSummary } from "@example-rr-invoke/app-shared";
import { checkoutHandle } from "@example-rr-invoke/checkout-journey";

const DEMO_ORDER: OrderSummary = {
  orderId: "ORD-42",
  customerId: "CUST-001",
  itemName: "Single-malt Highland Reserve, 700ml",
  amount: 89.5,
  requiresAgeCheck: true,
};

interface Props {
  readonly runtime: JourneyRuntime;
}

export function Home({ runtime }: Props) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TerminalOutcome | null>(null);

  function start() {
    setOutcome(null);
    setInstanceId(runtime.start(checkoutHandle, { order: DEMO_ORDER }));
  }

  function reset() {
    if (instanceId) runtime.forget(instanceId);
    setInstanceId(null);
    setOutcome(null);
  }

  if (instanceId === null) {
    return (
      <Layout>
        <h1 style={{ marginBottom: "1rem" }}>Journey invoke / resume — React Router</h1>
        <p style={{ marginBottom: "1rem", color: "#475569" }}>
          The checkout journey runs from review → confirm. Mid-flow, it <strong>invokes</strong> the
          verify-identity child journey when the order requires age verification, and{" "}
          <strong>resumes</strong> after the child completes — picking up the verification token
          typed end-to-end.
        </p>
        <p style={{ marginBottom: "1rem", color: "#475569" }}>
          Reload the page during the verify step: both the parent and the child rehydrate from{" "}
          <code>localStorage</code> and the link is restored. The verify modal pops right back up.
        </p>
        <button type="button" onClick={start} style={primaryButton}>
          Start checkout
        </button>
      </Layout>
    );
  }

  return (
    <Layout>
      <header style={{ display: "flex", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ flex: 1 }}>Journey invoke / resume — React Router</h1>
        <button type="button" onClick={reset} style={secondaryButton}>
          Restart
        </button>
      </header>
      <CallStackBanner runtime={runtime} rootId={instanceId} />
      <JourneyOutlet
        runtime={runtime}
        instanceId={instanceId}
        onFinished={setOutcome}
        loadingFallback={<p>Loading checkout…</p>}
      />
      {outcome ? (
        <pre
          style={{
            marginTop: "1rem",
            padding: "1rem",
            background: "#0f172a",
            color: "#7dd3fc",
            borderRadius: "0.5rem",
            fontSize: "0.85rem",
          }}
        >
          {`${outcome.status.toUpperCase()}: ${JSON.stringify(outcome.payload, null, 2)}`}
        </pre>
      ) : null}
    </Layout>
  );
}

/**
 * Surfaces the current call chain — handy for the demo so the
 * parent → child relationship is visible at a glance, even though the
 * `<JourneyOutlet>` already follows the chain to render the leaf.
 */
function CallStackBanner({
  runtime,
  rootId,
}: {
  readonly runtime: JourneyRuntime;
  readonly rootId: string;
}) {
  const chain = useJourneyCallStack(runtime, rootId);
  if (chain.length <= 1) return null;
  return (
    <p
      style={{
        marginBottom: "1rem",
        padding: "0.5rem 0.75rem",
        background: "#fef3c7",
        border: "1px solid #fde68a",
        borderRadius: "0.25rem",
        fontSize: "0.85rem",
        color: "#78350f",
      }}
    >
      Call stack: {chain.map((id) => runtime.getInstance(id)?.journeyId ?? "?").join(" → ")}
    </p>
  );
}

function Layout({ children }: { readonly children: React.ReactNode }) {
  return <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>{children}</main>;
}

const primaryButton = {
  padding: "0.75rem 1.25rem",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: "0.375rem",
  cursor: "pointer",
  fontSize: "1rem",
};

const secondaryButton = {
  padding: "0.5rem 0.75rem",
  background: "white",
  color: "#475569",
  border: "1px solid #cbd5e1",
  borderRadius: "0.25rem",
  cursor: "pointer",
};
