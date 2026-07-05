import { describe, expectTypeOf, test } from "vitest";
import {
  defineEntry,
  defineExit,
  defineExitContract,
  defineModule,
  schema,
} from "@modular-frontend/core";
import { defineJourney } from "./define-journey.js";

// Shared contracts and per-module exits for the type-level checks.
const cancelledContract = defineExitContract<{ reason: string }>("cancelled");

const profileExits = {
  approved: defineExit<{ profileId: string }>(),
  cancelled: cancelledContract,
} as const;
const profile = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: profileExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ customerId: string }>(),
    }),
  },
});

const billingExits = {
  approved: defineExit<{ billingId: string }>(),
  cancelled: cancelledContract,
} as const;
const billing = defineModule({
  id: "billing",
  version: "1.0.0",
  exitPoints: billingExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ customerId: string }>(),
    }),
  },
});

type Modules = { readonly profile: typeof profile; readonly billing: typeof billing };

describe("wildcardTransitions — type-level narrowing", () => {
  test("byExit handler output is narrowed to the contract type when shared", () => {
    defineJourney<Modules, Record<string, never>>()({
      id: "type-narrow-byexit",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({
        module: "profile" as const,
        entry: "review" as const,
        input: { customerId: "x" },
      }),
      transitions: {
        profile: { review: { approved: () => ({ complete: undefined as never }) } },
      },
      wildcardTransitions: {
        byExit: {
          cancelled: ({ output }) => {
            // Both modules use cancelledContract → output collapses to { reason: string }.
            expectTypeOf(output).toEqualTypeOf<{ reason: string }>();
            return { abort: { reason: output.reason } };
          },
        },
      },
    });
  });

  test("byEntryAndExit handler output is narrowed to the contract type when shared", () => {
    defineJourney<Modules, Record<string, never>>()({
      id: "type-narrow-byentryandexit",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({
        module: "profile" as const,
        entry: "review" as const,
        input: { customerId: "x" },
      }),
      transitions: {
        profile: { review: { approved: () => ({ complete: undefined as never }) } },
      },
      wildcardTransitions: {
        byEntryAndExit: {
          review: {
            cancelled: ({ output }) => {
              expectTypeOf(output).toEqualTypeOf<{ reason: string }>();
              return { abort: { reason: output.reason } };
            },
          },
        },
      },
    });
  });

  test("byEntryAndExit input is narrowed to the intersection across modules with that entry", () => {
    defineJourney<Modules, Record<string, never>>()({
      id: "type-narrow-input",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({
        module: "profile" as const,
        entry: "review" as const,
        input: { customerId: "x" },
      }),
      transitions: {
        profile: { review: { approved: () => ({ complete: undefined as never }) } },
      },
      wildcardTransitions: {
        byEntryAndExit: {
          review: {
            cancelled: ({ input }) => {
              // Both profile.review and billing.review take { customerId: string }
              // — intersection collapses to the shared shape.
              expectTypeOf(input).toEqualTypeOf<{ customerId: string }>();
              return { abort: { reason: "x" } };
            },
          },
        },
      },
    });
  });

  test("byExit input is unknown — entry name is also unknown", () => {
    defineJourney<Modules, Record<string, never>>()({
      id: "type-narrow-byexit-input",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({
        module: "profile" as const,
        entry: "review" as const,
        input: { customerId: "x" },
      }),
      transitions: {
        profile: { review: { approved: () => ({ complete: undefined as never }) } },
      },
      wildcardTransitions: {
        byExit: {
          cancelled: ({ input }) => {
            expectTypeOf(input).toEqualTypeOf<unknown>();
            return { abort: { reason: "x" } };
          },
        },
      },
    });
  });
});
