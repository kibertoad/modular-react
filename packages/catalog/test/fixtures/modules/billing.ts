// Plain object that matches ModuleDescriptor shape — avoids importing the
// runtime defineModule helper to keep fixtures dependency-free and fast.
export default {
  id: "billing",
  version: "1.2.0",
  meta: {
    name: "Billing",
    description: "Issues invoices and processes payments.",
    ownerTeam: "billing-platform",
    domain: "finance",
    tags: ["payments", "invoicing"],
    status: "stable" as const,
    customField: "value-not-in-catalog-meta",
  },
  navigation: [{ label: "Billing", to: "/billing" }],
  slots: { commands: [] },
  requires: ["auth"] as const,
  optionalRequires: ["analytics"] as const,
  entryPoints: { review: { component: () => null } },
  exitPoints: { paid: {}, cancelled: {} },
};
