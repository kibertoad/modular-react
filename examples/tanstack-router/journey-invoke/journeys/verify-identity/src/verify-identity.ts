import { defineJourney, defineJourneyHandle } from "@modular-react/journeys";
import type { AgeVerificationToken } from "@example-tsr-invoke/app-shared";
import type ageVerifyModule from "@example-tsr-invoke/age-verify-module";

type VerifyModules = {
  readonly "age-verify": typeof ageVerifyModule;
};

export interface VerifyIdentityInput {
  readonly customerId: string;
}

export interface VerifyIdentityState {
  readonly customerId: string;
}

export const verifyIdentityJourney = defineJourney<
  VerifyModules,
  VerifyIdentityState,
  AgeVerificationToken
>()({
  id: "verify-identity",
  version: "1.0.0",
  meta: {
    name: "Age verification",
    ownerTeam: "trust-and-safety",
    domain: "compliance",
    tags: ["identity"],
    status: "stable",
  },

  initialState: ({ customerId }: VerifyIdentityInput) => ({ customerId }),

  start: (state) => ({
    module: "age-verify",
    entry: "confirm",
    input: { customerId: state.customerId },
  }),

  transitions: {
    "age-verify": {
      confirm: {
        verified: ({ output }) => ({ complete: output }),
        declined: ({ output }) => ({ abort: { reason: "declined", detail: output.reason } }),
      },
    },
  },

  onHydrate: (blob) => {
    if (blob.version !== "1.0.0") {
      throw new Error(`Unknown verify-identity journey version: ${blob.version}`);
    }
    return blob;
  },
});

export type VerifyIdentityJourney = typeof verifyIdentityJourney;
export const verifyIdentityHandle = defineJourneyHandle(verifyIdentityJourney);
export type VerifyIdentityHandle = typeof verifyIdentityHandle;
