// Shared domain types for the Nuxt modal-journey example. Kept tiny: the point
// of this example is the *hosting* shape (a modal-mounted journey in Nuxt with
// Pinia persistence and app-wide runtime threading), not a rich domain.

export type PlanTier = "standard" | "pro" | "enterprise";

export interface SubscriptionPlan {
  readonly tier: PlanTier;
  readonly monthly: number;
}

/** Catalog shared between the step component and the confirm step. */
export const PLAN_CATALOG: Readonly<Record<PlanTier, SubscriptionPlan>> = {
  standard: { tier: "standard", monthly: 29 },
  pro: { tier: "pro", monthly: 79 },
  enterprise: { tier: "enterprise", monthly: 199 },
};
