import { defineEntry, defineModule, schema } from "@modular-react/core";
import { Review } from "./Review.js";
import type { ReviewInput } from "./Review.js";
import { reviewExits } from "./exits.js";

export { reviewExits };
export type { ReviewExits } from "./exits.js";
export type { ReviewInput };

// Inferring `defineModule` without generics keeps the descriptor's literal
// types (entry/exit names, schemas) accessible via `typeof` — the journey
// reads them to cross-check transitions at compile time.
export default defineModule({
  id: "checkout-review",
  version: "1.0.0",
  meta: {
    name: "Checkout review",
    description: "Lets the user review the order and proceed to age verification.",
  },
  exitPoints: reviewExits,
  entryPoints: {
    review: defineEntry({
      component: Review,
      input: schema<ReviewInput>(),
    }),
  },
});
