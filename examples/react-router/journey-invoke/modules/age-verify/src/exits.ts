import { defineExit } from "@modular-react/core";
import type { AgeVerificationToken } from "@example-rr-invoke/app-shared";

export const ageVerifyExits = {
  /** User confirmed they are over the threshold. Outputs the token. */
  verified: defineExit<AgeVerificationToken>(),
  /** User declined / cancelled. The child journey aborts and the parent's
   *  resume sees `outcome.status === "aborted"`. */
  declined: defineExit<{ reason: string }>(),
} as const;

export type AgeVerifyExits = typeof ageVerifyExits;
