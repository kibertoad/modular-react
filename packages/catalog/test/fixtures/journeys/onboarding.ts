export default {
  id: "customer-onboarding",
  version: "1.0.0",
  meta: {
    name: "Customer Onboarding",
    ownerTeam: "onboarding",
    domain: "onboarding",
    tags: ["acquisition"],
  },
  initialState: () => ({}),
  start: () => ({ module: "profile", entry: "review", input: {} }),
  transitions: {
    profile: {
      review: {
        allowBack: true,
        profileComplete: () => ({ next: { module: "billing", entry: "review", input: {} } }),
        cancelled: () => ({ abort: { reason: "rep-cancelled" } }),
      },
    },
    billing: {
      review: {
        paid: () => ({ complete: { kind: "paid" } }),
        cancelled: () => ({ abort: { reason: "payment-failed" } }),
      },
    },
  },
  invokes: [{ id: "kyc-check" }],
  moduleCompat: { profile: "^1.0.0", billing: "^1.0.0" },
};
