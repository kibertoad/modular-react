export default {
  id: "profile",
  version: "1.0.0",
  meta: {
    name: "Profile",
    description: "Confirms a customer's profile.",
    ownerTeam: "onboarding",
    domain: "onboarding",
    tags: ["customer"],
  },
  createRoutes: () => [{ path: "profile" }],
  entryPoints: { review: { component: () => null } },
  exitPoints: { confirmed: {} },
};
