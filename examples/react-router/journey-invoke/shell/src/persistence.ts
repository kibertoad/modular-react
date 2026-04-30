import { createWebStoragePersistence } from "@modular-react/journeys";
import type { CheckoutInput, CheckoutState } from "@example-rr-invoke/checkout-journey";
import type {
  VerifyIdentityInput,
  VerifyIdentityState,
} from "@example-rr-invoke/verify-identity-journey";

/**
 * localStorage-backed persistence for both the parent (checkout) and child
 * (verify-identity) journeys. Each gets its own adapter — the runtime uses
 * the journey id internally to namespace the keys, so the user-supplied
 * `keyFor` only needs to be unique within a journey.
 *
 * The persisted blobs round-trip the parent's `pendingInvoke` and the
 * child's `parentLink` automatically. On reload the runtime relinks them
 * via the in-memory `parent` / `activeChildId` fields after both blobs
 * hydrate — see `@modular-react/journeys` README, "Composing journeys".
 */
export const checkoutPersistence = createWebStoragePersistence<CheckoutInput, CheckoutState>({
  keyFor: ({ input }) => `checkout:${input.order.orderId}`,
});

export const verifyIdentityPersistence = createWebStoragePersistence<
  VerifyIdentityInput,
  VerifyIdentityState
>({
  // Namespacing the child by `parent-orderId:customerId` keeps the demo
  // simple and predictable: re-opening the demo with the same order id
  // resumes both the parent AND the child, exactly where the user left
  // off mid-verification.
  keyFor: ({ input }) => `verify:${input.customerId}`,
});
