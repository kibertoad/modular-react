import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { simulateJourney } from "./simulate-journey.js";
import { selectModule, selectModuleOrDefault } from "./select-module.js";

// -----------------------------------------------------------------------------
// Shared module fixtures
// -----------------------------------------------------------------------------

const githubModule = defineModule({
  id: "github",
  version: "1.0.0",
  exitPoints: { saved: defineExit<{ ref: string }>() } as const,
  entryPoints: {
    configure: defineEntry({
      component: (() => null) as never,
      input: schema<{ workspaceId: string; repo: string }>(),
    }),
  },
});

const strapiModule = defineModule({
  id: "strapi",
  version: "1.0.0",
  exitPoints: { saved: defineExit<{ ref: string }>() } as const,
  entryPoints: {
    configure: defineEntry({
      component: (() => null) as never,
      input: schema<{ workspaceId: string; url: string }>(),
    }),
  },
});

const genericModule = defineModule({
  id: "generic",
  version: "1.0.0",
  exitPoints: { saved: defineExit<{ ref: string }>() } as const,
  entryPoints: {
    configure: defineEntry({
      component: (() => null) as never,
      input: schema<{ workspaceId: string; kind: string }>(),
    }),
  },
});

// -----------------------------------------------------------------------------
// selectModule — exhaustive form
// -----------------------------------------------------------------------------

describe("selectModule (exhaustive)", () => {
  // Chooser emits exactly the set of module ids the journey can dispatch
  // to — `kind: "github" | "strapi"` — so the cases object must cover
  // both, and the dispatcher's TKey narrows to that same union.
  const exhaustiveChooser = defineModule({
    id: "chooser",
    version: "1.0.0",
    exitPoints: { chosen: defineExit<{ kind: "github" | "strapi" }>() } as const,
    entryPoints: {
      pick: defineEntry({
        component: (() => null) as never,
        input: schema<{ workspaceId: string }>(),
      }),
    },
  });

  type Modules = {
    readonly chooser: typeof exhaustiveChooser;
    readonly github: typeof githubModule;
    readonly strapi: typeof strapiModule;
  };

  interface State {
    readonly workspaceId: string;
    readonly selected: "github" | "strapi" | null;
  }

  const select = selectModule<Modules>();

  const journey = defineJourney<Modules, State>()({
    id: "exhaustive-dispatch",
    version: "1.0.0",
    initialState: ({ workspaceId }: { workspaceId: string }) => ({
      workspaceId,
      selected: null,
    }),
    start: (state) => ({
      module: "chooser",
      entry: "pick",
      input: { workspaceId: state.workspaceId },
    }),
    transitions: {
      chooser: {
        pick: {
          chosen: ({ output, state }) => ({
            state: { ...state, selected: output.kind },
            next: select(output.kind, {
              github: {
                entry: "configure",
                input: { workspaceId: state.workspaceId, repo: "demo/repo" },
              },
              strapi: {
                entry: "configure",
                input: { workspaceId: state.workspaceId, url: "https://strapi.example" },
              },
            }),
          }),
        },
      },
      github: {
        configure: { saved: ({ output }) => ({ complete: { kind: "github", ref: output.ref } }) },
      },
      strapi: {
        configure: { saved: ({ output }) => ({ complete: { kind: "strapi", ref: output.ref } }) },
      },
    },
  });

  it("dispatches to the github branch when the key matches", () => {
    const sim = simulateJourney(journey, { workspaceId: "ws-1" });
    sim.fireExit("chosen", { kind: "github" });
    expect(sim.currentStep).toEqual({
      moduleId: "github",
      entry: "configure",
      input: { workspaceId: "ws-1", repo: "demo/repo" },
    });
    expect(sim.state.selected).toBe("github");
  });

  it("dispatches to the strapi branch when the key matches", () => {
    const sim = simulateJourney(journey, { workspaceId: "ws-2" });
    sim.fireExit("chosen", { kind: "strapi" });
    expect(sim.currentStep).toEqual({
      moduleId: "strapi",
      entry: "configure",
      input: { workspaceId: "ws-2", url: "https://strapi.example" },
    });
  });

  it("returns a plain StepSpec without leaking extra fields", () => {
    const result = select("github", {
      github: { entry: "configure", input: { workspaceId: "w", repo: "r" } },
      strapi: { entry: "configure", input: { workspaceId: "w", url: "u" } },
    });
    expect(Object.keys(result).sort()).toEqual(["entry", "input", "module"]);
    expect(result).toEqual({
      module: "github",
      entry: "configure",
      input: { workspaceId: "w", repo: "r" },
    });
  });

  it("throws when the discriminator type is bypassed at runtime", () => {
    // Cast through `never` to simulate a runtime value that escaped the
    // union (e.g. an older serialized blob feeding back into a transition).
    // The exhaustive form has no fallback, so this is a programmer bug —
    // throw loudly with a message that names the offending key.
    expect(() =>
      select("nope" as never, {
        github: { entry: "configure", input: { workspaceId: "w", repo: "r" } },
        strapi: { entry: "configure", input: { workspaceId: "w", url: "u" } },
      }),
    ).toThrow(/no case for key "nope".*selectModuleOrDefault/);
  });

  it("rejects prototype-chain keys instead of resolving them to Object.prototype", () => {
    // Without the `hasOwn` gate, `cases["__proto__"]` returns
    // Object.prototype — truthy but with no `entry`/`input` — and the
    // helper would emit a malformed StepSpec. Verify both classic
    // prototype-pollution vectors fall into the same throw path as any
    // other unknown key.
    const cases = {
      github: { entry: "configure" as const, input: { workspaceId: "w", repo: "r" } },
      strapi: { entry: "configure" as const, input: { workspaceId: "w", url: "u" } },
    };
    expect(() => select("__proto__" as never, cases)).toThrow(/no case for key "__proto__"/);
    expect(() => select("toString" as never, cases)).toThrow(/no case for key "toString"/);
  });
});

// -----------------------------------------------------------------------------
// selectModuleOrDefault — fallback form
// -----------------------------------------------------------------------------

describe("selectModuleOrDefault (fallback)", () => {
  // Chooser emits a discriminator wider than the set of specific modules
  // — "contentful" has no dedicated module here, so it must reach the
  // generic fallback at runtime.
  const fallbackChooser = defineModule({
    id: "chooser",
    version: "1.0.0",
    exitPoints: {
      chosen: defineExit<{ kind: "github" | "strapi" | "contentful" }>(),
    } as const,
    entryPoints: {
      pick: defineEntry({
        component: (() => null) as never,
        input: schema<{ workspaceId: string }>(),
      }),
    },
  });

  type Modules = {
    readonly chooser: typeof fallbackChooser;
    readonly github: typeof githubModule;
    readonly strapi: typeof strapiModule;
    readonly generic: typeof genericModule;
  };

  interface State {
    readonly workspaceId: string;
    readonly selected: "github" | "strapi" | "contentful" | null;
  }

  const select = selectModuleOrDefault<Modules>();

  const journey = defineJourney<Modules, State>()({
    id: "fallback-dispatch",
    version: "1.0.0",
    initialState: ({ workspaceId }: { workspaceId: string }) => ({
      workspaceId,
      selected: null,
    }),
    start: (state) => ({
      module: "chooser",
      entry: "pick",
      input: { workspaceId: state.workspaceId },
    }),
    transitions: {
      chooser: {
        pick: {
          chosen: ({ output, state }) => ({
            state: { ...state, selected: output.kind },
            next: select(
              output.kind,
              {
                // Specific case only for github — strapi and contentful funnel
                // through the generic fallback to prove both "uncovered key in
                // the module map" and "key absent from the module map" reach
                // the same path.
                github: {
                  entry: "configure",
                  input: { workspaceId: state.workspaceId, repo: "demo/repo" },
                },
              },
              {
                module: "generic",
                entry: "configure",
                input: { workspaceId: state.workspaceId, kind: output.kind },
              },
            ),
          }),
        },
      },
      github: {
        configure: { saved: ({ output }) => ({ complete: { kind: "github", ref: output.ref } }) },
      },
      strapi: {
        configure: { saved: ({ output }) => ({ complete: { kind: "strapi", ref: output.ref } }) },
      },
      generic: {
        configure: { saved: ({ output }) => ({ complete: { kind: "generic", ref: output.ref } }) },
      },
    },
  });

  it("uses a specific case when the key matches", () => {
    const sim = simulateJourney(journey, { workspaceId: "ws-1" });
    sim.fireExit("chosen", { kind: "github" });
    expect(sim.currentStep).toEqual({
      moduleId: "github",
      entry: "configure",
      input: { workspaceId: "ws-1", repo: "demo/repo" },
    });
  });

  it("falls through to the default for an uncovered module-map key", () => {
    const sim = simulateJourney(journey, { workspaceId: "ws-2" });
    sim.fireExit("chosen", { kind: "strapi" });
    expect(sim.currentStep).toEqual({
      moduleId: "generic",
      entry: "configure",
      input: { workspaceId: "ws-2", kind: "strapi" },
    });
  });

  it("falls through for a key that isn't in the module map at all", () => {
    const sim = simulateJourney(journey, { workspaceId: "ws-3" });
    sim.fireExit("chosen", { kind: "contentful" });
    expect(sim.currentStep).toEqual({
      moduleId: "generic",
      entry: "configure",
      input: { workspaceId: "ws-3", kind: "contentful" },
    });
  });

  it("returns the fallback by reference when the key is not matched", () => {
    // The runtime forwards the caller-supplied fallback as-is — no clone —
    // so `state` rewrites and other journey machinery see the same object
    // the author wrote.
    const fallback = {
      module: "generic" as const,
      entry: "configure" as const,
      input: { workspaceId: "w", kind: "x" },
    };
    const result = select("unknown" as never, {}, fallback);
    expect(result).toBe(fallback);
  });

  it("routes prototype-chain keys to the fallback instead of Object.prototype", () => {
    // Mirrors the equivalent guard tested on `selectModule`. Without the
    // `hasOwn` gate, `cases["__proto__"]` would return Object.prototype
    // and the helper would emit a malformed StepSpec instead of falling
    // through to the supplied fallback.
    const fallback = {
      module: "generic" as const,
      entry: "configure" as const,
      input: { workspaceId: "w", kind: "fallback" },
    };
    expect(select("__proto__" as never, {}, fallback)).toBe(fallback);
    expect(select("toString" as never, {}, fallback)).toBe(fallback);
  });
});
