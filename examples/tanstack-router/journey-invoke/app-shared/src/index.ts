// Shared types for the journey-invoke example (TanStack Router variant).
//
// Conceptually identical to the React Router version — only the surrounding
// router differs. The point of the example is the parent → invoke → child →
// resume flow.

import { createSharedHooks } from "@tanstack-react-modules/core";

export interface AppDependencies {}

export interface AppSlots {}

const { useStore, useService } = createSharedHooks<AppDependencies>();

export { useStore, useService };

// Domain types — same as the RR variant.

export interface OrderSummary {
  readonly orderId: string;
  readonly customerId: string;
  readonly itemName: string;
  readonly amount: number;
  readonly requiresAgeCheck: boolean;
}

export interface AgeVerificationToken {
  readonly token: string;
  readonly verifiedAt: string;
}
