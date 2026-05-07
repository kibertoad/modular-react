import { describe, expect, it, vi } from "vitest";
import {
  defineEntry,
  defineExit,
  defineExitContract,
  defineModule,
  isJourneySystemAbort,
  schema,
  type StandardSchemaLike,
} from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime, getInternals } from "./runtime.js";
import type { RegisteredJourney } from "./types.js";
import { validateJourneyContracts, JourneyValidationError } from "./validation.js";

// --- Shared exit contracts --------------------------------------------------

const cancelledContract = defineExitContract<{ reason: string }>("cancelled");
const errorContract = defineExitContract<{ code: string }>("error");

// --- Fixture modules --------------------------------------------------------

const profileExits = {
  approved: defineExit<{ profileId: string }>(),
  cancelled: cancelledContract,
  error: errorContract,
} as const;

const profileModule = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: profileExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as any,
      input: schema<{ customerId: string }>(),
    }),
  },
});

const billingExits = {
  approved: defineExit<{ billingId: string }>(),
  cancelled: cancelledContract,
  error: errorContract,
} as const;

const billingModule = defineModule({
  id: "billing",
  version: "1.0.0",
  exitPoints: billingExits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as any,
      input: schema<{ customerId: string }>(),
    }),
    confirm: defineEntry({
      component: (() => null) as any,
      input: schema<{ customerId: string }>(),
    }),
  },
});

type Modules = {
  readonly profile: typeof profileModule;
  readonly billing: typeof billingModule;
};

interface State {
  readonly customerId: string;
  readonly trail: ReadonlyArray<string>;
}

const moduleMap = { profile: profileModule, billing: billingModule };

function freshRuntime(definition: any) {
  return createJourneyRuntime([{ definition, options: undefined } as RegisteredJourney], {
    modules: moduleMap,
    debug: false,
  });
}

function fireExit(
  rt: ReturnType<typeof freshRuntime>,
  id: string,
  exitName: string,
  output?: unknown,
) {
  const internals = getInternals(rt);
  const rec = internals.__getRecord(id)!;
  const reg = internals.__getRegistered(rec.journeyId)!;
  internals.__bindStepCallbacks(rec, reg).exit(exitName, output);
}

// ---------------------------------------------------------------------------
// Runtime precedence
// ---------------------------------------------------------------------------

describe("wildcardTransitions — runtime precedence (exact > byEntryAndExit > byExit)", () => {
  function makeJourney(opts: {
    readonly exact?: boolean;
    readonly byEntryAndExit?: boolean;
    readonly byExit?: boolean;
  }) {
    const onAbort = vi.fn();
    const definition = defineJourney<Modules, State>()({
      id: "tiers",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            ...(opts.exact
              ? {
                  cancelled: ({ state }: any) => ({
                    state: { ...state, trail: [...state.trail, "exact"] },
                    abort: { reason: "exact" },
                  }),
                }
              : {}),
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        ...(opts.byEntryAndExit
          ? {
              byEntryAndExit: {
                review: {
                  cancelled: ({ state }: any) => ({
                    state: { ...state, trail: [...state.trail, "byEntryAndExit"] },
                    abort: { reason: "byEntryAndExit" },
                  }),
                },
              },
            }
          : {}),
        ...(opts.byExit
          ? {
              byExit: {
                cancelled: ({ state }: any) => ({
                  state: { ...state, trail: [...state.trail, "byExit"] },
                  abort: { reason: "byExit" },
                }),
              },
            }
          : {}),
      },
      onAbort,
    });
    return { definition, onAbort };
  }

  it("fires the exact handler when all three tiers exist", () => {
    const { definition } = makeJourney({ exact: true, byEntryAndExit: true, byExit: true });
    const rt = freshRuntime(definition);
    const id = rt.start("tiers", { customerId: "C-1" });
    fireExit(rt, id, "cancelled", { reason: "user" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    expect((inst.terminalPayload as { reason: string }).reason).toBe("exact");
    expect((inst.state as State).trail).toEqual(["exact"]);
  });

  it("falls through to byEntryAndExit when no exact", () => {
    const { definition } = makeJourney({ byEntryAndExit: true, byExit: true });
    const rt = freshRuntime(definition);
    const id = rt.start("tiers", { customerId: "C-2" });
    fireExit(rt, id, "cancelled", { reason: "user" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    expect((inst.terminalPayload as { reason: string }).reason).toBe("byEntryAndExit");
  });

  it("falls through to byExit when neither exact nor byEntryAndExit match", () => {
    const { definition } = makeJourney({ byExit: true });
    const rt = freshRuntime(definition);
    const id = rt.start("tiers", { customerId: "C-3" });
    fireExit(rt, id, "cancelled", { reason: "user" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    expect((inst.terminalPayload as { reason: string }).reason).toBe("byExit");
  });

  it("ignores the exit (warn) when no tier matches", () => {
    const { definition } = makeJourney({});
    const rt = freshRuntime(definition);
    const id = rt.start("tiers", { customerId: "C-4" });
    fireExit(rt, id, "cancelled", { reason: "user" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("active");
  });
});

describe("wildcardTransitions — entry-keyed wildcards distinguish entry names", () => {
  it("byEntryAndExit only fires for the matching entry name", () => {
    const definition = defineJourney<Modules, State>()({
      id: "entry-keyed",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "billing",
        entry: "confirm",
        input: { customerId: s.customerId },
      }),
      transitions: {
        billing: {
          // No exact handler for `cancelled` from `confirm`.
          confirm: {
            approved: () => ({ complete: { ok: true } }),
          },
          // Different entry has its own exact handler.
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byEntryAndExit: {
          // Only matches when current step's entry is `review`.
          review: {
            cancelled: () => ({ abort: { reason: "byEntryAndExit-review" } }),
          },
        },
        byExit: {
          cancelled: () => ({ abort: { reason: "byExit" } }),
        },
      },
    });
    const rt = freshRuntime(definition);
    // Active step is billing.confirm — byEntryAndExit.review.cancelled
    // does NOT match; byExit.cancelled does.
    const id = rt.start("entry-keyed", { customerId: "C-1" });
    fireExit(rt, id, "cancelled", { reason: "x" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    expect((inst.terminalPayload as { reason: string }).reason).toBe("byExit");
  });
});

// ---------------------------------------------------------------------------
// Schema validation at emit time
// ---------------------------------------------------------------------------

/** Minimal hand-rolled StandardSchemaV1 — no zod dep. */
function objectStringFieldSchema<K extends string>(
  key: K,
): StandardSchemaLike<{ readonly [k in K]: string }> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        if (typeof value !== "object" || value === null) {
          return { issues: [{ message: "expected object" }] };
        }
        const v = (value as Record<string, unknown>)[key];
        if (typeof v !== "string") {
          return { issues: [{ message: `expected ${key} to be string`, path: [key] }] };
        }
        return { value: { [key]: v } as { readonly [k in K]: string } };
      },
    },
  };
}

function asyncSchema<T>(): StandardSchemaLike<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test-async",
      validate: () => Promise.resolve({ value: undefined as unknown as T }),
    },
  };
}

describe("ExitContract — runtime payload validation", () => {
  it("aborts with exit-payload-invalid on schema failure", () => {
    const schemaContract = defineExitContract("cancelled", objectStringFieldSchema("reason"));

    const exitsWithSchema = {
      approved: defineExit<{ profileId: string }>(),
      cancelled: schemaContract,
    } as const;
    const profile = defineModule({
      id: "profile",
      version: "1.0.0",
      exitPoints: exitsWithSchema,
      entryPoints: {
        review: defineEntry({ component: (() => null) as any, input: schema<void>() }),
      },
    });

    type Mods = { readonly profile: typeof profile };
    const definition = defineJourney<Mods, { trail: ReadonlyArray<string> }>()({
      id: "schema-fail",
      version: "1.0.0",
      initialState: () => ({ trail: [] as ReadonlyArray<string> }),
      start: () => ({ module: "profile" as const, entry: "review" as const, input: undefined }),
      transitions: {
        profile: {
          review: {
            cancelled: () => ({ abort: { reason: "handler-ran" } }),
          },
        },
      },
    });
    const rt = createJourneyRuntime([{ definition, options: undefined } as RegisteredJourney], {
      modules: { profile },
      debug: false,
    });
    const id = rt.start("schema-fail");
    // Deliberately wrong shape (no `reason` field).
    fireExit(rt, id, "cancelled", { whoops: 42 });

    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    const payload = inst.terminalPayload;
    expect(isJourneySystemAbort(payload)).toBe(true);
    if (isJourneySystemAbort(payload)) {
      expect(payload.reason).toBe("exit-payload-invalid");
      if (payload.reason === "exit-payload-invalid") {
        expect(payload.exit).toBe("cancelled");
        expect(payload.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it("passes the validated payload to the handler on success", () => {
    const schemaContract = defineExitContract("cancelled", objectStringFieldSchema("reason"));
    const exitsWithSchema = {
      approved: defineExit<{ profileId: string }>(),
      cancelled: schemaContract,
    } as const;
    const profile = defineModule({
      id: "profile",
      version: "1.0.0",
      exitPoints: exitsWithSchema,
      entryPoints: {
        review: defineEntry({ component: (() => null) as any, input: schema<void>() }),
      },
    });

    type Mods = { readonly profile: typeof profile };
    const seen: Array<unknown> = [];
    const definition = defineJourney<Mods, Record<string, never>>()({
      id: "schema-ok",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "profile" as const, entry: "review" as const, input: undefined }),
      transitions: {
        profile: {
          review: {
            cancelled: ({ output }: any) => {
              seen.push(output);
              return { abort: { reason: "ok" } };
            },
          },
        },
      },
    });
    const rt = createJourneyRuntime([{ definition, options: undefined } as RegisteredJourney], {
      modules: { profile },
      debug: false,
    });
    const id = rt.start("schema-ok");
    fireExit(rt, id, "cancelled", { reason: "user", extra: "stripped" });

    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(seen).toHaveLength(1);
    // The schema's parsed value drops `extra`.
    expect(seen[0]).toEqual({ reason: "user" });
  });

  it("aborts with exit-payload-invalid-async when the schema is async", () => {
    const asyncContract = defineExitContract("cancelled", asyncSchema<{ reason: string }>());
    const profile = defineModule({
      id: "profile",
      version: "1.0.0",
      exitPoints: { cancelled: asyncContract } as const,
      entryPoints: {
        review: defineEntry({ component: (() => null) as any, input: schema<void>() }),
      },
    });

    type Mods = { readonly profile: typeof profile };
    const definition = defineJourney<Mods, Record<string, never>>()({
      id: "schema-async",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "profile" as const, entry: "review" as const, input: undefined }),
      transitions: {
        profile: {
          review: {
            cancelled: () => ({ abort: { reason: "should-not-run" } }),
          },
        },
      },
    });
    const rt = createJourneyRuntime([{ definition, options: undefined } as RegisteredJourney], {
      modules: { profile },
      debug: false,
    });
    const id = rt.start("schema-async");
    fireExit(rt, id, "cancelled", { reason: "user" });

    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    const payload = inst.terminalPayload;
    expect(isJourneySystemAbort(payload)).toBe(true);
    if (isJourneySystemAbort(payload) && payload.reason === "exit-payload-invalid-async") {
      expect(payload.exit).toBe("cancelled");
    } else {
      throw new Error(`expected exit-payload-invalid-async, got ${JSON.stringify(payload)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

describe("validateJourneyContracts — wildcardTransitions", () => {
  function regWith(definition: any): RegisteredJourney {
    return { definition, options: undefined } as RegisteredJourney;
  }

  it("rejects byExit pointing at an exit no registered module emits", () => {
    const def = defineJourney<Modules, State>()({
      id: "dead-exit",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byExit: {
          // No reachable module declares `nope`.
          // @ts-expect-error — type forbids unknown exit names; the runtime
          // validator backstops authors using AnyJourneyDefinition.
          nope: () => ({ abort: { reason: "x" } }),
        },
      },
    });
    expect(() => validateJourneyContracts([regWith(def)], [profileModule, billingModule])).toThrow(
      JourneyValidationError,
    );
  });

  it("rejects byEntryAndExit when no registered module pairs that entry with that exit", () => {
    const def = defineJourney<Modules, State>()({
      id: "dead-entry-exit",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byEntryAndExit: {
          // No registered module pairs `review` with `cancelledFromConfirm`
          // — that exit name doesn't exist on the modules at all.
          review: {
            // @ts-expect-error — type forbids unknown exit names; the runtime
            // validator backstops authors using AnyJourneyDefinition.
            cancelledFromConfirm: () => ({ abort: { reason: "x" } }),
          },
        },
      },
    });
    expect(() => validateJourneyContracts([regWith(def)], [profileModule, billingModule])).toThrow(
      JourneyValidationError,
    );
  });

  it("rejects mixed contract identities for the same exit name", () => {
    const otherCancelled = defineExitContract<{ reason: string }>("cancelled");
    const drifted = defineModule({
      id: "drifted",
      version: "1.0.0",
      exitPoints: { cancelled: otherCancelled } as const,
      entryPoints: {
        review: defineEntry({
          component: (() => null) as any,
          input: schema<{ customerId: string }>(),
        }),
      },
    });

    type DriftMods = {
      readonly profile: typeof profileModule;
      readonly drifted: typeof drifted;
    };

    const def = defineJourney<DriftMods, State>()({
      id: "contract-drift",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
        drifted: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byExit: {
          cancelled: () => ({ abort: { reason: "wc" } }),
        },
      },
    });
    expect(() => validateJourneyContracts([regWith(def)], [profileModule, drifted])).toThrowError(
      /different ExitContract/,
    );
  });

  it("warns (does not throw) when both byExit and byEntryAndExit declare the same exit", () => {
    const def = defineJourney<Modules, State>()({
      id: "overlap",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byEntryAndExit: {
          review: {
            cancelled: () => ({ abort: { reason: "specific" } }),
          },
        },
        byExit: {
          cancelled: () => ({ abort: { reason: "general" } }),
        },
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        validateJourneyContracts([regWith(def)], [profileModule, billingModule]),
      ).not.toThrow();
      expect(warn).toHaveBeenCalled();
      const msg = warn.mock.calls.flat().join(" ");
      expect(msg).toMatch(/wildcardTransitions\.byExit\["cancelled"\]/);
    } finally {
      warn.mockRestore();
    }
  });

  it("accepts matching contract identities across modules", () => {
    // Both profileModule and billingModule reference the same
    // `cancelledContract` — the consistency check should pass.
    const def = defineJourney<Modules, State>()({
      id: "consistent",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
        billing: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byExit: {
          cancelled: () => ({ abort: { reason: "wc" } }),
        },
      },
    });
    expect(() =>
      validateJourneyContracts([regWith(def)], [profileModule, billingModule]),
    ).not.toThrow();
  });

  it("does not flag a module declaring the exit as a plain ExitPointSchema (non-contract) alongside contract-using modules", () => {
    // billingModule uses cancelledContract; this `plain` module declares
    // its `cancelled` exit as a non-contract ExitPointSchema. The
    // consistency check is contract-vs-contract only — modules that opt
    // out of the contract are tolerated (they just won't share the
    // wildcard's narrowed output type).
    const plain = defineModule({
      id: "plain",
      version: "1.0.0",
      exitPoints: {
        approved: defineExit<{ done: true }>(),
        cancelled: defineExit<{ reason: string }>(),
      } as const,
      entryPoints: {
        review: defineEntry({
          component: (() => null) as any,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    type PlainMods = {
      readonly billing: typeof billingModule;
      readonly plain: typeof plain;
    };
    const def = defineJourney<PlainMods, State>()({
      id: "mixed",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "billing",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        billing: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
        plain: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byExit: {
          cancelled: () => ({ abort: { reason: "wc" } }),
        },
      },
    });
    expect(() => validateJourneyContracts([regWith(def)], [billingModule, plain])).not.toThrow();
  });

  it("rejects a non-function handler under either tier", () => {
    const def: any = {
      id: "bad-handler",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "profile", entry: "review", input: { customerId: "x" } }),
      transitions: {
        profile: { review: { approved: () => ({ complete: { ok: true } }) } },
      },
      wildcardTransitions: {
        byExit: {
          // not a function
          cancelled: 42,
        },
        byEntryAndExit: {
          review: {
            // not a function
            error: "nope",
          },
        },
      },
    };
    expect(() =>
      validateJourneyContracts(
        [{ definition: def, options: undefined } as RegisteredJourney],
        [profileModule, billingModule],
      ),
    ).toThrowError(/non-function/);
  });

  it("rejects a non-object wildcardTransitions value", () => {
    const def: any = {
      id: "malformed-root",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "profile", entry: "review", input: { customerId: "x" } }),
      transitions: {
        profile: { review: { approved: () => ({ complete: { ok: true } }) } },
      },
      wildcardTransitions: 42,
    };
    expect(() =>
      validateJourneyContracts(
        [{ definition: def, options: undefined } as RegisteredJourney],
        [profileModule, billingModule],
      ),
    ).toThrowError(/malformed wildcardTransitions \(expected an object/);
  });

  it("rejects a non-object byExit / byEntryAndExit container", () => {
    const def: any = {
      id: "malformed-slots",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "profile", entry: "review", input: { customerId: "x" } }),
      transitions: {
        profile: { review: { approved: () => ({ complete: { ok: true } }) } },
      },
      wildcardTransitions: {
        byEntryAndExit: 7,
        byExit: "nope",
      },
    };
    expect(() =>
      validateJourneyContracts(
        [{ definition: def, options: undefined } as RegisteredJourney],
        [profileModule, billingModule],
      ),
    ).toThrowError(
      /malformed wildcardTransitions\.byEntryAndExit.*malformed wildcardTransitions\.byExit/s,
    );
  });

  it("rejects a malformed inner shape under byEntryAndExit", () => {
    const def: any = {
      id: "malformed",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "profile", entry: "review", input: { customerId: "x" } }),
      transitions: {
        profile: { review: { approved: () => ({ complete: { ok: true } }) } },
      },
      wildcardTransitions: {
        byEntryAndExit: {
          review: 12, // expected an object
        },
      },
    };
    expect(() =>
      validateJourneyContracts(
        [{ definition: def, options: undefined } as RegisteredJourney],
        [profileModule, billingModule],
      ),
    ).toThrowError(/malformed/);
  });
});

// ---------------------------------------------------------------------------
// Behavior — state propagation, multi-step journeys, observability
// ---------------------------------------------------------------------------

describe("wildcardTransitions — state propagation and observability", () => {
  it("propagates state updates returned from a wildcard handler", () => {
    const definition = defineJourney<Modules, State>()({
      id: "state-prop",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
      wildcardTransitions: {
        byExit: {
          cancelled: ({ state, output }: any) => ({
            state: { ...state, trail: [...state.trail, `wc:${output.reason}`] },
            abort: { reason: "wc" },
          }),
        },
      },
    });
    const rt = freshRuntime(definition);
    const id = rt.start("state-prop", { customerId: "C-state" });
    fireExit(rt, id, "cancelled", { reason: "byUser" });
    const inst = rt.getInstance(id)!;
    expect((inst.state as State).trail).toEqual(["wc:byUser"]);
    expect(inst.status).toBe("aborted");
  });

  it("records the leaving step in history when a wildcard advances via `next`", () => {
    const definition = defineJourney<Modules, State>()({
      id: "wc-next",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: { review: { approved: () => ({ complete: { ok: true } }) } },
        billing: {
          review: { approved: () => ({ complete: { ok: true } }) },
        },
      },
      wildcardTransitions: {
        byExit: {
          // Wildcard for `error` redirects to billing.review for retry.
          error: ({ state }: any) => ({
            state,
            next: {
              module: "billing" as const,
              entry: "review" as const,
              input: { customerId: state.customerId },
            },
          }),
        },
      },
    });
    const rt = freshRuntime(definition);
    const id = rt.start("wc-next", { customerId: "C-next" });
    fireExit(rt, id, "error", { code: "EXX" });
    const inst = rt.getInstance(id)!;
    expect(inst.step).toEqual({
      moduleId: "billing",
      entry: "review",
      input: { customerId: "C-next" },
    });
    expect(inst.history).toEqual([
      { moduleId: "profile", entry: "review", input: { customerId: "C-next" } },
    ]);
    expect(inst.status).toBe("active");
  });

  it("fires onTransition with the wildcard's exit name set", () => {
    const onTransition = vi.fn();
    const def: any = {
      id: "wc-event",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s: { customerId: string }) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: { review: { approved: () => ({ complete: { ok: true } }) } },
      },
      wildcardTransitions: {
        byExit: {
          cancelled: () => ({ abort: { reason: "wc" } }),
        },
      },
      onTransition,
    };
    const rt = freshRuntime(def);
    const id = rt.start("wc-event", { customerId: "C-evt" });
    fireExit(rt, id, "cancelled", { reason: "x" });
    // start fires once; the wildcard-handled abort fires a second time.
    expect(onTransition).toHaveBeenCalledTimes(2);
    const last = onTransition.mock.calls.at(-1)![0] as { exit: string | null };
    expect(last.exit).toBe("cancelled");
  });

  it("fires the wildcard at later steps, not just the start step", () => {
    const definition = defineJourney<Modules, State>()({
      id: "wc-multi-step",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: ({ state }: any) => ({
              state,
              next: {
                module: "billing" as const,
                entry: "review" as const,
                input: { customerId: state.customerId },
              },
            }),
          },
        },
        billing: {
          review: { approved: () => ({ complete: { ok: true } }) },
        },
      },
      wildcardTransitions: {
        byExit: {
          // Wildcard handles cancelled at billing.review (the second
          // step), not the first.
          cancelled: () => ({ abort: { reason: "from-step-2" } }),
        },
      },
    });
    const rt = freshRuntime(definition);
    const id = rt.start("wc-multi-step", { customerId: "C-multi" });
    // Advance to step 2 via `approved` on the first step.
    fireExit(rt, id, "approved", { profileId: "p" });
    expect(rt.getInstance(id)!.step!.moduleId).toBe("billing");
    // Now fire cancelled at step 2 — the wildcard catches it.
    fireExit(rt, id, "cancelled", { reason: "x" });
    const inst = rt.getInstance(id)!;
    expect(inst.status).toBe("aborted");
    expect((inst.terminalPayload as { reason: string }).reason).toBe("from-step-2");
  });
});

describe("ExitContract — debug warning when modules are omitted", () => {
  it("warns once per missing module, not once per exit", () => {
    const definition = defineJourney<Modules, State>()({
      id: "no-modules",
      version: "1.0.0",
      initialState: ({ customerId }: { customerId: string }) => ({
        customerId,
        trail: [] as ReadonlyArray<string>,
      }),
      start: (s) => ({
        module: "profile",
        entry: "review",
        input: { customerId: s.customerId },
      }),
      transitions: {
        profile: {
          review: {
            approved: () => ({ complete: { ok: true } }),
            // Two contract-based exits on the same module; same warning
            // dedupes so total warn count stays at 1.
            cancelled: () => ({ abort: { reason: "cancelled" } }),
            error: () => ({ abort: { reason: "error" } }),
          },
        },
      },
    });
    // No modules option — schema validation has nothing to resolve.
    const rt = createJourneyRuntime([{ definition, options: undefined } as RegisteredJourney], {
      debug: true,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const id = rt.start("no-modules", { customerId: "C-warn" });
      fireExit(rt, id, "cancelled", { reason: "user" });
      // Subsequent exit on same module from a different start shouldn't double-warn.
      const id2 = rt.start("no-modules", { customerId: "C-warn-2" });
      fireExit(rt, id2, "error", { code: "X" });
      const missingModuleWarns = warn.mock.calls.filter((args) =>
        String(args[0] ?? "").includes("No descriptor for module"),
      );
      expect(missingModuleWarns).toHaveLength(1);
      expect(String(missingModuleWarns[0]?.[0])).toContain("profile");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("ExitContract — runtime validation gating", () => {
  it("does not validate when the contract has no schema", () => {
    // errorContract has no schema. Runtime should accept any payload
    // and pass it through verbatim.
    const seen: Array<unknown> = [];
    const definition = defineJourney<Modules, Record<string, never>>()({
      id: "no-schema",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({
        module: "profile" as const,
        entry: "review" as const,
        input: { customerId: "C" },
      }),
      transitions: {
        profile: {
          review: {
            error: ({ output }: any) => {
              seen.push(output);
              return { abort: { reason: "ok" } };
            },
            approved: () => ({ complete: { ok: true } }),
          },
        },
      },
    });
    const rt = freshRuntime(definition);
    const id = rt.start("no-schema");
    // Garbage payload — should be passed through, not coerced or
    // rejected, because errorContract has no schema.
    const garbage = { nothing: "matches" };
    fireExit(rt, id, "error", garbage);
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(seen).toEqual([garbage]);
  });
});
