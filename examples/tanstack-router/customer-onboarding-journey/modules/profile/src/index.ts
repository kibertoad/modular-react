import { defineEntry, defineModule, schema } from "@modular-react/core";
import { profileExits } from "./exits.js";
import { ReviewProfile, type ReviewProfileInput } from "./ReviewProfile.js";

export { profileExits };
export type { ProfileExits } from "./exits.js";

// Note: `defineModule` is called without generics so the descriptor's literal
// type (specifically `entryPoints` / `exitPoints`) survives into `typeof`
// consumers — the journey definition needs those narrow types to cross-check
// transitions. A typed shell still gets AppDependencies/AppSlots enforcement
// at `registry.register(...)` time.
export default defineModule({
  id: "profile",
  version: "1.0.0",
  meta: {
    name: "Profile",
    description: "Confirms a customer's profile and suggests a starting plan.",
    ownerTeam: "onboarding-core",
    domain: "onboarding",
    tags: ["profile"],
    status: "stable",
  },
  exitPoints: profileExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewProfile,
      input: schema<ReviewProfileInput>(),
    }),
  },
});
