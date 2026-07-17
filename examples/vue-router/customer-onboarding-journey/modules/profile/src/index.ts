import { defineEntry, defineModule, schema } from "@modular-frontend/core";
import { profileExits } from "./exits.js";
import ReviewProfile from "./ReviewProfile.vue";
import type { ReviewProfileInput } from "./types.js";

export { profileExits };
export type { ProfileExits } from "./exits.js";
export type { ReviewProfileInput } from "./types.js";

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
  },
  exitPoints: profileExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewProfile,
      input: schema<ReviewProfileInput>(),
    }),
  },
});
