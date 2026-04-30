import { createWebStoragePersistence } from "@modular-react/journeys";
import type { CheckoutInput, CheckoutState } from "@example-tsr-invoke/checkout-journey";
import type {
  VerifyIdentityInput,
  VerifyIdentityState,
} from "@example-tsr-invoke/verify-identity-journey";

export const checkoutPersistence = createWebStoragePersistence<CheckoutInput, CheckoutState>({
  keyFor: ({ input }) => `checkout:${input.order.orderId}`,
});

export const verifyIdentityPersistence = createWebStoragePersistence<
  VerifyIdentityInput,
  VerifyIdentityState
>({
  keyFor: ({ input }) => `verify:${input.customerId}`,
});
