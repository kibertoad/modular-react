// Shared types for the journey-invoke example.
//
// The example is intentionally minimal: AppDependencies is empty (no
// services or stores needed for this demo) and AppSlots is empty (no slot
// composition). The point of the example is the parent → invoke → child →
// resume flow, not the surrounding registry features.

import { createSharedHooks } from "@react-router-modules/core";

export interface AppDependencies {}

export interface AppSlots {}

// Re-export shared hooks so modules can `useStore` / `useService` from the
// same canonical surface as the rest of the workspace. createSharedHooks
// is single-generic; slot hooks aren't needed here because AppSlots is empty.
const { useStore, useService } = createSharedHooks<AppDependencies>();

export { useStore, useService };

// Domain types shared between modules and journeys.

/** A simulated order under checkout. */
export interface OrderSummary {
  readonly orderId: string;
  readonly customerId: string;
  readonly itemName: string;
  readonly amount: number;
  /**
   * Marker that this order requires age verification before checkout. The
   * demo always sets this to true so the parent journey reliably invokes
   * the verify-identity child journey.
   */
  readonly requiresAgeCheck: boolean;
}

/**
 * The token a successful age verification produces. The shape is the
 * verify-identity journey's `TOutput` — the parent's resume handler reads
 * `outcome.payload.token` typed against this same interface, end-to-end.
 */
export interface AgeVerificationToken {
  readonly token: string;
  readonly verifiedAt: string;
}
