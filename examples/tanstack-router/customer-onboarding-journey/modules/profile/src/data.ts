import type { PlanHint, PlanTier } from "@example-tsr-onboarding/app-shared";

export interface CustomerRecord {
  readonly name: string;
  readonly company: string;
  readonly seats: number;
  readonly readiness: "all-set" | "needs-details" | "self-serve";
  readonly readinessDetail?: string;
}

/**
 * Hard-coded fixture data standing in for a real account API. The shell
 * starts journeys for these customer ids; the profile module looks them up
 * synchronously when it renders.
 */
const CUSTOMERS: Readonly<Record<string, CustomerRecord>> = {
  "C-1": {
    name: "Alice Martin",
    company: "Orbital Robotics",
    seats: 12,
    readiness: "all-set",
  },
  "C-2": {
    name: "Brent Oduya",
    company: "Meridian Freight",
    seats: 40,
    readiness: "self-serve",
  },
  "C-3": {
    name: "Casey Rivera",
    company: "Rivera Consulting",
    seats: 4,
    readiness: "needs-details",
    readinessDetail: "tax ID missing on the account record",
  },
};

export function loadCustomer(customerId: string): CustomerRecord {
  return (
    CUSTOMERS[customerId] ?? {
      name: `Unknown customer (${customerId})`,
      company: "—",
      seats: 1,
      readiness: "needs-details",
      readinessDetail: "customer record not found",
    }
  );
}

function tierForSeats(seats: number): PlanTier {
  if (seats >= 25) return "enterprise";
  if (seats >= 10) return "pro";
  return "standard";
}

export function suggestPlan(record: CustomerRecord): PlanHint {
  const suggestedTier = tierForSeats(record.seats);
  return {
    suggestedTier,
    rationale: `${record.seats} seats — ${suggestedTier} is the usual starting point.`,
  };
}

export function selfServeAmount(record: CustomerRecord): number {
  // Flat "first month" charge for the agent-assisted quick-buy path.
  return Math.max(49, record.seats * 5);
}
