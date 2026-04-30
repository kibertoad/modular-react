import { defineExit } from "@modular-react/core";
import type { AgeVerificationToken } from "@example-tsr-invoke/app-shared";

export const ageVerifyExits = {
  verified: defineExit<AgeVerificationToken>(),
  declined: defineExit<{ reason: string }>(),
} as const;

export type AgeVerifyExits = typeof ageVerifyExits;
