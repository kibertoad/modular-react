// Tests for the cycle / depth / declared-set / bounce-limit guards that
// protect the invoke / resume runtime from circular journey dependencies
// and runaway recursion. Static checks live in `validation.test.ts` for
// `validateJourneyGraph`; this file targets the runtime-side aborts.

import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { defineJourneyHandle, invoke } from "./handle.js";
import { createJourneyRuntime } from "./runtime.js";
import { createTestHarness } from "./testing.js";
import {
  JourneyValidationError,
  validateJourneyContracts,
  validateJourneyGraph,
} from "./validation.js";

// ---------------------------------------------------------------------------
// Shared module — a single one-entry module shared by every cycle-safety
// fixture below. Each journey nests it under its own type alias to keep
// the inferred `TModules` distinct.
// ---------------------------------------------------------------------------

const exits = {
  go: defineExit(),
  pong: defineExit<{ kind: "pong" }>(),
} as const;

const mod = defineModule({
  id: "m",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    step: defineEntry({
      component: (() => null) as never,
      input: schema<void>(),
    }),
  },
});

type Modules = { readonly m: typeof mod };

// ---------------------------------------------------------------------------
// Static cycle detection (validateJourneyGraph + validateJourneyContracts).
// ---------------------------------------------------------------------------

describe("validateJourneyGraph — static cycle detection", () => {
  it("accepts a registration with no invokes declared", () => {
    const j = defineJourney<Modules, {}>()({
      id: "j",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    expect(() =>
      validateJourneyGraph([{ definition: j, options: undefined }]),
    ).not.toThrow();
  });

  it("accepts an acyclic graph", () => {
    const c = defineJourney<Modules, {}>()({
      id: "c",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    const cHandle = defineJourneyHandle(c);
    const b = defineJourney<Modules, {}>()({
      id: "b",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [cHandle],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    const bHandle = defineJourneyHandle(b);
    const a = defineJourney<Modules, {}>()({
      id: "a",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [bHandle, cHandle],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    expect(() =>
      validateJourneyGraph([
        { definition: a, options: undefined },
        { definition: b, options: undefined },
        { definition: c, options: undefined },
      ]),
    ).not.toThrow();
  });

  it("rejects a self-loop", () => {
    // Build a self-referential `invokes` via a deferred handle so the
    // declaration site can list the journey before it exists. The runtime
    // only reads `handle.id`, so a `{ id }`-shaped placeholder is enough.
    const a = defineJourney<Modules, {}>()({
      id: "a",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "a" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    expect(() => validateJourneyGraph([{ definition: a, options: undefined }])).toThrow(
      /cycle detected:.*"a".*"a"/,
    );
  });

  it("rejects a direct two-cycle A → B → A", () => {
    const a = defineJourney<Modules, {}>()({
      id: "a",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "b" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    const b = defineJourney<Modules, {}>()({
      id: "b",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "a" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    expect(() =>
      validateJourneyGraph([
        { definition: a, options: undefined },
        { definition: b, options: undefined },
      ]),
    ).toThrow(/cycle detected/);
  });

  it("rejects an indirect three-cycle A → B → C → A and reports it once", () => {
    const a = defineJourney<Modules, {}>()({
      id: "a",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "b" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    const b = defineJourney<Modules, {}>()({
      id: "b",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "c" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    const c = defineJourney<Modules, {}>()({
      id: "c",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "a" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });

    let err: unknown;
    try {
      validateJourneyGraph([
        { definition: a, options: undefined },
        { definition: b, options: undefined },
        { definition: c, options: undefined },
      ]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(JourneyValidationError);
    const issues = (err as JourneyValidationError).issues;
    // One canonical cycle should produce one report despite three DFS
    // roots all closing it.
    const cycleIssues = issues.filter((i) => i.startsWith("journey invoke cycle"));
    expect(cycleIssues).toHaveLength(1);
    expect(cycleIssues[0]).toMatch(/"a".*"b".*"c".*"a"/);
  });

  it("ignores edges to journeys not in the registration set", () => {
    const a = defineJourney<Modules, {}>()({
      id: "a",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "missing" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    expect(() =>
      validateJourneyGraph([{ definition: a, options: undefined }]),
    ).not.toThrow();
  });

  it("validateJourneyContracts surfaces cycle errors alongside structural ones", () => {
    const a = defineJourney<Modules, {}>()({
      id: "a",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "m", entry: "step", input: undefined }),
      invokes: [{ id: "a" } as never],
      transitions: { m: { step: { go: () => ({ complete: null }) } } },
    });
    let err: JourneyValidationError | null = null;
    try {
      validateJourneyContracts([{ definition: a, options: undefined }], [mod]);
    } catch (e) {
      err = e as JourneyValidationError;
    }
    expect(err).not.toBeNull();
    expect(err!.issues.some((i) => i.startsWith("journey invoke cycle"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Runtime guards — fixtures.
//
// We build pairs of "looker" journeys whose transitions return invokes
// targeting another journey's handle. The handle is built post-hoc by
// referencing each journey's id as a placeholder when needed (the runtime
// only consumes `handle.id`).
// ---------------------------------------------------------------------------

interface CounterState {
  readonly hops: number;
}

function makeBouncyParent(opts: {
  readonly id: string;
  readonly childId: string;
  readonly declareInvokes: boolean;
}) {
  const childHandle = { id: opts.childId } as never;
  return defineJourney<Modules, CounterState>()({
    id: opts.id,
    version: "1.0.0",
    initialState: () => ({ hops: 0 }),
    start: () => ({ module: "m", entry: "step", input: undefined }),
    invokes: opts.declareInvokes ? [childHandle] : undefined,
    transitions: {
      m: {
        step: {
          go: ({ state }) =>
            invoke({
              handle: childHandle,
              input: undefined,
              resume: "afterChild",
            }) as never,
          // Provide a manual `complete` exit too so tests can step the parent.
          pong: ({ state }) => ({ complete: { hops: state.hops } }),
        },
      },
    },
    resumes: {
      m: {
        step: {
          // Default resume — a test can drive different parent definitions
          // by extending. For the bounce tests we keep returning invoke
          // until the limit forces an abort.
          afterChild: ({ state }) =>
            invoke({
              handle: childHandle,
              input: undefined,
              resume: "afterChild",
            }) as never,
        },
      },
    },
  });
}

function makeChild(id: string) {
  return defineJourney<Modules, void, { kind: "pong" }>()({
    id,
    version: "1.0.0",
    initialState: () => undefined,
    start: () => ({ module: "m", entry: "step", input: undefined }),
    transitions: {
      m: {
        step: {
          pong: ({ output }) => ({ complete: output }),
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// invoke-cycle: same id already on the active chain.
// ---------------------------------------------------------------------------

describe("runtime guard — invoke-cycle (same id on active chain)", () => {
  it("aborts the parent when a child's transition would re-invoke the parent journey id", () => {
    // Two journeys: outer invokes inner; inner's transition tries to invoke
    // outer. The dynamic graph closes a cycle the static check could only
    // catch if BOTH journeys declared `invokes`.
    const innerExits = { go: defineExit() } as const;
    const innerMod = defineModule({
      id: "inner-mod",
      version: "1.0.0",
      exitPoints: innerExits,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const outerExits = { go: defineExit() } as const;
    const outerMod = defineModule({
      id: "outer-mod",
      version: "1.0.0",
      exitPoints: outerExits,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });

    // Build inner first with a deferred reference to outer's handle.
    const outerHandlePlaceholder = { id: "outer" } as never;
    const innerJourney = defineJourney<{ "inner-mod": typeof innerMod }, void>()({
      id: "inner",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "inner-mod", entry: "s", input: undefined }),
      // Deliberately NOT declared in `invokes` so the static check does not
      // fire — the runtime guard is what we're exercising.
      transitions: {
        "inner-mod": {
          s: {
            go: () =>
              invoke({
                handle: outerHandlePlaceholder,
                input: undefined,
                resume: "afterOuter",
              }) as never,
          },
        },
      },
      resumes: {
        "inner-mod": {
          s: {
            afterOuter: () => ({ complete: undefined as never }),
          },
        },
      },
    });
    const innerHandle = defineJourneyHandle(innerJourney);

    const outerJourney = defineJourney<{ "outer-mod": typeof outerMod }, void>()({
      id: "outer",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "outer-mod", entry: "s", input: undefined }),
      transitions: {
        "outer-mod": {
          s: {
            go: () =>
              invoke({
                handle: innerHandle,
                input: undefined,
                resume: "afterInner",
              }) as never,
          },
        },
      },
      resumes: {
        "outer-mod": {
          s: {
            afterInner: () => ({ complete: undefined as never }),
          },
        },
      },
    });

    const rt = createJourneyRuntime(
      [
        { definition: outerJourney, options: undefined },
        { definition: innerJourney, options: undefined },
      ],
      {
        modules: { "outer-mod": outerMod, "inner-mod": innerMod },
        debug: false,
      },
    );

    const harness = createTestHarness(rt);
    const outerId = rt.start("outer", undefined);
    harness.fireExit(outerId, "go");
    const innerId = rt.getInstance(outerId)!.activeChildId!;
    expect(innerId).toBeTruthy();
    // Inner now tries to invoke outer — should abort the inner with the
    // cycle reason; the outer's resume handler runs with the abort outcome.
    harness.fireExit(innerId, "go");

    const inner = rt.getInstance(innerId)!;
    expect(inner.status).toBe("aborted");
    const reason = inner.terminalPayload as { reason: string; chain: string[] };
    expect(reason.reason).toBe("invoke-cycle");
    expect(reason.chain).toEqual(["outer", "inner", "outer"]);
  });
});

// ---------------------------------------------------------------------------
// invoke-stack-overflow: max depth across the chain.
// ---------------------------------------------------------------------------

describe("runtime guard — invoke-stack-overflow", () => {
  it("aborts when a chain of distinct ids would push past the depth cap", () => {
    // A → B → C, with the outer chain capped at 2 via the parent's
    // registration option. Starting A and triggering A's invoke of B
    // already takes us to depth 2, so the next invoke (B → C) should
    // abort B with `invoke-stack-overflow`.

    const aMod = defineModule({
      id: "a-mod",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const bMod = defineModule({
      id: "b-mod",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const cMod = defineModule({
      id: "c-mod",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });

    const c = defineJourney<{ "c-mod": typeof cMod }, void>()({
      id: "c",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "c-mod", entry: "s", input: undefined }),
      transitions: {
        "c-mod": {
          s: { go: () => ({ complete: undefined as never }) },
        },
      },
    });
    const cHandle = defineJourneyHandle(c);

    const b = defineJourney<{ "b-mod": typeof bMod }, void>()({
      id: "b",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "b-mod", entry: "s", input: undefined }),
      invokes: [cHandle],
      transitions: {
        "b-mod": {
          s: {
            go: () =>
              invoke({ handle: cHandle, input: undefined, resume: "afterC" }) as never,
          },
        },
      },
      resumes: {
        "b-mod": {
          s: {
            afterC: () => ({ complete: undefined as never }),
          },
        },
      },
    });
    const bHandle = defineJourneyHandle(b);

    const a = defineJourney<{ "a-mod": typeof aMod }, void>()({
      id: "a",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "a-mod", entry: "s", input: undefined }),
      invokes: [bHandle],
      transitions: {
        "a-mod": {
          s: {
            go: () =>
              invoke({ handle: bHandle, input: undefined, resume: "afterB" }) as never,
          },
        },
      },
      resumes: {
        "a-mod": {
          s: {
            afterB: () => ({ complete: undefined as never }),
          },
        },
      },
    });

    const rt = createJourneyRuntime(
      [
        // Cap depth via A's registration option — the resolver takes the
        // minimum across the chain, so A's choice governs.
        {
          definition: a,
          options: { maxCallStackDepth: 2 },
        },
        { definition: b, options: undefined },
        { definition: c, options: undefined },
      ],
      {
        modules: { "a-mod": aMod, "b-mod": bMod, "c-mod": cMod },
        debug: false,
      },
    );

    const harness = createTestHarness(rt);
    const aId = rt.start("a", undefined);
    harness.fireExit(aId, "go"); // A → B (depth 2)
    const bId = rt.getInstance(aId)!.activeChildId!;
    expect(bId).toBeTruthy();
    // Now B tries to invoke C; depth would be 3, exceeding cap of 2.
    harness.fireExit(bId, "go");

    const bRecord = rt.getInstance(bId)!;
    expect(bRecord.status).toBe("aborted");
    const reason = bRecord.terminalPayload as {
      reason: string;
      cap: number;
      depth: number;
      chain: string[];
    };
    expect(reason.reason).toBe("invoke-stack-overflow");
    expect(reason.cap).toBe(2);
    expect(reason.depth).toBe(3);
    expect(reason.chain).toEqual(["a", "b", "c"]);
  });

  it("uses the minimum cap across the chain when multiple journeys configure one", () => {
    // Same A → B → C trio, but cap is set on B (2) and on A (10).
    // Resolver takes the min — 2 — so B → C still aborts.
    const aMod = defineModule({
      id: "a-mod",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const bMod = defineModule({
      id: "b-mod",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const cMod = defineModule({
      id: "c-mod",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });

    const c = defineJourney<{ "c-mod": typeof cMod }, void>()({
      id: "c",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "c-mod", entry: "s", input: undefined }),
      transitions: {
        "c-mod": { s: { go: () => ({ complete: undefined as never }) } },
      },
    });
    const cHandle = defineJourneyHandle(c);
    const b = defineJourney<{ "b-mod": typeof bMod }, void>()({
      id: "b",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "b-mod", entry: "s", input: undefined }),
      invokes: [cHandle],
      transitions: {
        "b-mod": {
          s: { go: () => invoke({ handle: cHandle, input: undefined, resume: "z" }) as never },
        },
      },
      resumes: {
        "b-mod": {
          s: { z: () => ({ complete: undefined as never }) },
        },
      },
    });
    const bHandle = defineJourneyHandle(b);
    const a = defineJourney<{ "a-mod": typeof aMod }, void>()({
      id: "a",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "a-mod", entry: "s", input: undefined }),
      invokes: [bHandle],
      transitions: {
        "a-mod": {
          s: { go: () => invoke({ handle: bHandle, input: undefined, resume: "z" }) as never },
        },
      },
      resumes: {
        "a-mod": {
          s: { z: () => ({ complete: undefined as never }) },
        },
      },
    });

    const rt = createJourneyRuntime(
      [
        { definition: a, options: { maxCallStackDepth: 10 } },
        { definition: b, options: { maxCallStackDepth: 2 } },
        { definition: c, options: undefined },
      ],
      { modules: { "a-mod": aMod, "b-mod": bMod, "c-mod": cMod }, debug: false },
    );

    const harness = createTestHarness(rt);
    const aId = rt.start("a", undefined);
    harness.fireExit(aId, "go");
    const bId = rt.getInstance(aId)!.activeChildId!;
    harness.fireExit(bId, "go");
    expect(rt.getInstance(bId)!.status).toBe("aborted");
    expect((rt.getInstance(bId)!.terminalPayload as { cap: number }).cap).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// invoke-undeclared-child: dispatched handle not in invokes[].
// ---------------------------------------------------------------------------

describe("runtime guard — invoke-undeclared-child", () => {
  it("aborts when a transition dispatches a handle missing from invokes[]", () => {
    const childMod = defineModule({
      id: "ch",
      version: "1.0.0",
      exitPoints: { ok: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const intendedChild = defineJourney<{ ch: typeof childMod }, void>()({
      id: "intended",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "ch", entry: "s", input: undefined }),
      transitions: {
        ch: { s: { ok: () => ({ complete: undefined as never }) } },
      },
    });
    const sneakyChild = defineJourney<{ ch: typeof childMod }, void>()({
      id: "sneaky",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "ch", entry: "s", input: undefined }),
      transitions: {
        ch: { s: { ok: () => ({ complete: undefined as never }) } },
      },
    });
    const intendedHandle = defineJourneyHandle(intendedChild);
    const sneakyHandle = defineJourneyHandle(sneakyChild);

    const parentMod = defineModule({
      id: "p",
      version: "1.0.0",
      exitPoints: { go: defineExit<{ which: "intended" | "sneaky" }>() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const parent = defineJourney<{ p: typeof parentMod }, void>()({
      id: "parent",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "p", entry: "s", input: undefined }),
      // Declares only `intendedHandle` — dispatching `sneakyHandle` should
      // be rejected at the invoke-time guard even though the journey is
      // registered with the runtime.
      invokes: [intendedHandle],
      transitions: {
        p: {
          s: {
            go: ({ output }) =>
              invoke({
                handle: output.which === "intended" ? intendedHandle : sneakyHandle,
                input: undefined,
                resume: "after",
              }) as never,
          },
        },
      },
      resumes: {
        p: {
          s: { after: () => ({ complete: undefined as never }) },
        },
      },
    });

    const rt = createJourneyRuntime(
      [
        { definition: parent, options: undefined },
        { definition: intendedChild, options: undefined },
        { definition: sneakyChild, options: undefined },
      ],
      { modules: { p: parentMod, ch: childMod }, debug: false },
    );

    const harness = createTestHarness(rt);
    // The intended path works.
    const okId = rt.start("parent", undefined);
    harness.fireExit(okId, "go", { which: "intended" });
    expect(rt.getInstance(okId)!.activeChildId).toBeTruthy();

    // The sneaky path aborts at the guard.
    const badId = rt.start("parent", undefined);
    // start() is idempotent only when persistence is configured; here it's
    // not, so each start mints a new instance — different from `okId`.
    expect(badId).not.toBe(okId);
    harness.fireExit(badId, "go", { which: "sneaky" });
    expect(rt.getInstance(badId)!.status).toBe("aborted");
    const reason = rt.getInstance(badId)!.terminalPayload as {
      reason: string;
      childJourneyId: string;
      parentJourneyId: string;
    };
    expect(reason.reason).toBe("invoke-undeclared-child");
    expect(reason.childJourneyId).toBe("sneaky");
    expect(reason.parentJourneyId).toBe("parent");
  });

  it("does not check the declared set when invokes[] is omitted", () => {
    // Journey omits `invokes` — guard must not fire even for a child that
    // would have been "undeclared" had the field been present. The runtime
    // cycle / depth / bounce guards still apply.
    const childMod = defineModule({
      id: "ch",
      version: "1.0.0",
      exitPoints: { ok: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const child = defineJourney<{ ch: typeof childMod }, void>()({
      id: "child",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "ch", entry: "s", input: undefined }),
      transitions: {
        ch: { s: { ok: () => ({ complete: undefined as never }) } },
      },
    });
    const childHandle = defineJourneyHandle(child);
    const parentMod = defineModule({
      id: "p",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const parent = defineJourney<{ p: typeof parentMod }, void>()({
      id: "parent",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "p", entry: "s", input: undefined }),
      // No invokes[] declaration.
      transitions: {
        p: {
          s: {
            go: () =>
              invoke({ handle: childHandle, input: undefined, resume: "after" }) as never,
          },
        },
      },
      resumes: {
        p: {
          s: { after: () => ({ complete: undefined as never }) },
        },
      },
    });

    const rt = createJourneyRuntime(
      [
        { definition: parent, options: undefined },
        { definition: child, options: undefined },
      ],
      { modules: { p: parentMod, ch: childMod }, debug: false },
    );

    const harness = createTestHarness(rt);
    const id = rt.start("parent", undefined);
    harness.fireExit(id, "go");
    // Successful invoke — child is in flight, parent is still active.
    expect(rt.getInstance(id)!.activeChildId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// resume-bounce-limit: capped consecutive resume-driven re-invokes.
// ---------------------------------------------------------------------------

describe("runtime guard — resume-bounce-limit", () => {
  function buildBouncingPair(opts: {
    readonly bounceCap: number;
  }) {
    const childExits = { done: defineExit() } as const;
    const childMod = defineModule({
      id: "child-mod",
      version: "1.0.0",
      exitPoints: childExits,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const child = defineJourney<{ "child-mod": typeof childMod }, void>()({
      id: "child",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "child-mod", entry: "s", input: undefined }),
      transitions: {
        "child-mod": {
          s: { done: () => ({ complete: undefined as never }) },
        },
      },
    });
    const childHandle = defineJourneyHandle(child);

    const parentMod = defineModule({
      id: "parent-mod",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const parent = defineJourney<{ "parent-mod": typeof parentMod }, void>()({
      id: "parent",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "parent-mod", entry: "s", input: undefined }),
      invokes: [childHandle],
      transitions: {
        "parent-mod": {
          s: {
            go: () =>
              invoke({ handle: childHandle, input: undefined, resume: "afterChild" }) as never,
          },
        },
      },
      // Adversarial resume — always re-invokes, never advances the step.
      resumes: {
        "parent-mod": {
          s: {
            afterChild: () =>
              invoke({ handle: childHandle, input: undefined, resume: "afterChild" }) as never,
          },
        },
      },
    });

    const rt = createJourneyRuntime(
      [
        {
          definition: parent,
          options: { maxResumeBouncesPerStep: opts.bounceCap },
        },
        { definition: child, options: undefined },
      ],
      {
        modules: { "parent-mod": parentMod, "child-mod": childMod },
        debug: false,
      },
    );

    return { rt, child, childHandle, parent };
  }

  it("aborts the parent after the configured bounce cap is exceeded", () => {
    const cap = 3;
    const { rt } = buildBouncingPair({ bounceCap: cap });
    const harness = createTestHarness(rt);
    const parentId = rt.start("parent", undefined);
    harness.fireExit(parentId, "go");
    // Initial invoke — depth 2. Now drive the child to completion `cap`
    // times in a row; each completion's resume re-invokes the child, which
    // is a "bounce." The cap+1-th completion should hit the guard.
    for (let i = 0; i < cap; i += 1) {
      const childId = rt.getInstance(parentId)!.activeChildId!;
      expect(childId).toBeTruthy();
      harness.fireExit(childId, "done");
    }
    // After `cap` bounces the parent has been re-invoking children but is
    // still active. The next bounce trips the limit.
    const nextChildId = rt.getInstance(parentId)!.activeChildId!;
    expect(nextChildId).toBeTruthy();
    harness.fireExit(nextChildId, "done");

    const parent = rt.getInstance(parentId)!;
    expect(parent.status).toBe("aborted");
    const reason = parent.terminalPayload as {
      reason: string;
      cap: number;
      count: number;
    };
    expect(reason.reason).toBe("resume-bounce-limit");
    expect(reason.cap).toBe(cap);
    expect(reason.count).toBe(cap + 1);
  });

  it("resets the bounce counter when the parent's step actually advances", () => {
    // Same fixture but the resume returns `{ next }` once before bouncing.
    const childExits = { done: defineExit() } as const;
    const childMod = defineModule({
      id: "ch",
      version: "1.0.0",
      exitPoints: childExits,
      entryPoints: {
        s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });
    const child = defineJourney<{ ch: typeof childMod }, void>()({
      id: "child2",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "ch", entry: "s", input: undefined }),
      transitions: {
        ch: { s: { done: () => ({ complete: undefined as never }) } },
      },
    });
    const childHandle = defineJourneyHandle(child);
    const parentMod = defineModule({
      id: "p",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        s1: defineEntry({ component: (() => null) as never, input: schema<void>() }),
        s2: defineEntry({ component: (() => null) as never, input: schema<void>() }),
      },
    });

    let resumeCalls = 0;
    const parent = defineJourney<{ p: typeof parentMod }, void>()({
      id: "parent2",
      version: "1.0.0",
      initialState: () => undefined,
      start: () => ({ module: "p", entry: "s1", input: undefined }),
      invokes: [childHandle],
      transitions: {
        p: {
          s1: {
            go: () =>
              invoke({ handle: childHandle, input: undefined, resume: "after1" }) as never,
          },
          s2: {
            go: () =>
              invoke({ handle: childHandle, input: undefined, resume: "after2" }) as never,
          },
        },
      },
      resumes: {
        p: {
          s1: {
            after1: () => {
              resumeCalls += 1;
              if (resumeCalls === 1) {
                // First resume — advance the step, which should reset the counter.
                return { next: { module: "p", entry: "s2", input: undefined } } as never;
              }
              // Subsequent same-step bounces (after going to s2 we rebound
              // through after2, this branch is unreachable in practice).
              return invoke({ handle: childHandle, input: undefined, resume: "after1" }) as never;
            },
          },
          s2: {
            after2: () =>
              invoke({ handle: childHandle, input: undefined, resume: "after2" }) as never,
          },
        },
      },
    });

    const rt = createJourneyRuntime(
      [
        { definition: parent, options: { maxResumeBouncesPerStep: 2 } },
        { definition: child, options: undefined },
      ],
      { modules: { p: parentMod, ch: childMod }, debug: false },
    );

    const harness = createTestHarness(rt);
    const parentId = rt.start("parent2", undefined);
    harness.fireExit(parentId, "go"); // s1 → invoke (1st)
    let childId = rt.getInstance(parentId)!.activeChildId!;
    harness.fireExit(childId, "done"); // resume returns next → s2; counter resets

    // After the resume's `{ next }` arm fires, the parent has moved to s2
    // and no child is in flight. To bounce again, fire the s2 transition.
    expect(rt.getInstance(parentId)!.step?.entry).toBe("s2");
    expect(rt.getInstance(parentId)!.activeChildId).toBeNull();
    harness.fireExit(parentId, "go"); // s2 → invoke (1st at this step)

    // Now the parent invokes again from s2; bouncing on `after2` should
    // count from zero (post-reset). Bounce cap is 2.
    childId = rt.getInstance(parentId)!.activeChildId!;
    harness.fireExit(childId, "done"); // bounce 1 — count=1, allowed
    expect(rt.getInstance(parentId)!.status).toBe("active");
    childId = rt.getInstance(parentId)!.activeChildId!;
    harness.fireExit(childId, "done"); // bounce 2 — count=2, at cap, allowed
    expect(rt.getInstance(parentId)!.status).toBe("active");
    childId = rt.getInstance(parentId)!.activeChildId!;
    harness.fireExit(childId, "done"); // bounce 3 — over cap

    const parentRecord = rt.getInstance(parentId)!;
    expect(parentRecord.status).toBe("aborted");
    expect((parentRecord.terminalPayload as { reason: string }).reason).toBe(
      "resume-bounce-limit",
    );
  });

  it("persists the bounce counter across serialize/hydrate so reload cannot reset the budget", () => {
    const cap = 2;
    const { rt } = buildBouncingPair({ bounceCap: cap });
    const harness = createTestHarness(rt);
    const parentId = rt.start("parent", undefined);
    harness.fireExit(parentId, "go");

    // Bounce once — counter goes to 1 on the parent.
    const firstChildId = rt.getInstance(parentId)!.activeChildId!;
    harness.fireExit(firstChildId, "done");
    const inFlightChildId = rt.getInstance(parentId)!.activeChildId!;
    expect(inFlightChildId).toBeTruthy();

    // Serialize both blobs — the parent carries the counter; the child
    // carries `parentLink` so the second runtime can relink them.
    const parentBlob = rt.getInstance(parentId)!.serialize();
    const childBlob = rt.getInstance(inFlightChildId)!.serialize();

    expect(parentBlob.resumeBouncesAtStep).toEqual({
      stepToken: expect.any(Number),
      count: 1,
    });

    // Build a second runtime with the same registrations and hydrate
    // both blobs (no persistence is configured, so the runtime won't
    // auto-rehydrate the child; explicit hydrates simulate what a
    // persistence-backed reload would do automatically).
    const { rt: rt2 } = buildBouncingPair({ bounceCap: cap });
    const harness2 = createTestHarness(rt2);
    rt2.hydrate("child", childBlob);
    const newParentId = rt2.hydrate("parent", parentBlob);
    const linkedChildId = rt2.getInstance(newParentId)!.activeChildId;
    expect(linkedChildId).toBe(inFlightChildId);

    // Continue bouncing on the rehydrated parent. The persisted counter
    // means the budget is already at 1; the next bounce takes us to 2 (at
    // cap, allowed), the one after that trips the guard.
    harness2.fireExit(linkedChildId!, "done"); // bounce 2 — at cap, allowed
    expect(rt2.getInstance(newParentId)!.status).toBe("active");
    const newChildId = rt2.getInstance(newParentId)!.activeChildId!;
    harness2.fireExit(newChildId, "done"); // bounce 3 — over cap

    expect(rt2.getInstance(newParentId)!.status).toBe("aborted");
    expect(
      (rt2.getInstance(newParentId)!.terminalPayload as { reason: string }).reason,
    ).toBe("resume-bounce-limit");
  });
});
