/**
 * Regression coverage for the second review pass + the persistence-
 * removal + cycle-protection follow-up.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineModule, schema } from "@modular-react/core";

import { defineComposition } from "./define-composition.js";
import { createCompositionRuntime } from "./runtime.js";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import { useCompositionState } from "./hooks.js";
import type { RegisteredComposition } from "./types.js";

afterEach(() => {
  cleanup();
});

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// ---------------------------------------------------------------------------
// Hook-order regression — selector throws on one render, recovers on the
// next. Before the fix, a useRef declared after the early-return inside
// ZoneRenderer made React's "rendered fewer hooks than expected" check
// fire on the recovery render.
// ---------------------------------------------------------------------------

describe("ZoneRenderer hook stability across selector throws", () => {
  it("does not crash when a selector throws on one render and recovers on the next", () => {
    type State = { readonly flaky: boolean };
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        main: defineEntry({
          component: () => <div data-testid="ok">ok</div>,
          input: schema<void>(),
        }),
      },
    });
    type Modules = { readonly panels: typeof mod };
    const def = defineComposition<Modules, State>()({
      id: "flaky",
      version: "1.0.0",
      initialState: () => ({ flaky: true }),
      zones: {
        body: {
          select: ({ state }) => {
            if (state.flaky) {
              throw new Error("selector boom");
            }
            return { kind: "module-entry", module: "panels", entry: "main" };
          },
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("flaky", undefined);
    expect(() => {
      render(
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="flaky" instanceId={id}>
            {(zones) => <div data-testid="root">{zones.body}</div>}
          </CompositionOutlet>
        </CompositionsProvider>,
      );
    }).not.toThrow();
    expect(screen.queryByTestId("ok")).toBeNull();
    expect(() => {
      act(() => {
        runtime.dispatch<State>(id, { flaky: false });
      });
    }).not.toThrow();
    expect(screen.getByTestId("ok")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// subscribe disposal gate — last listener leaving while no outlet is
// attached should trigger disposal via the same microtask path that
// __detach uses.
// ---------------------------------------------------------------------------

describe("runtime.subscribe disposal gate", () => {
  const trivialDef = defineComposition<{}, { tick: number }>()({
    id: "trivial",
    version: "1.0.0",
    initialState: () => ({ tick: 0 }),
    zones: { only: { select: () => ({ kind: "empty" }) as const } },
  });

  it("disposes the instance after the last listener unsubscribes with no outlet attached", async () => {
    const runtime = createCompositionRuntime(
      [{ definition: trivialDef, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("trivial", undefined);
    const unsubscribe = runtime.subscribe(id, () => {});
    expect(runtime.getInstance(id)).not.toBeNull();
    unsubscribe();
    await flushMicrotasks();
    expect(runtime.getInstance(id)).toBeNull();
  });

  it("does not dispose if a re-subscribe lands before the microtask fires", async () => {
    const runtime = createCompositionRuntime(
      [{ definition: trivialDef, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("trivial", undefined);
    const unsubscribe = runtime.subscribe(id, () => {});
    unsubscribe();
    const unsubscribe2 = runtime.subscribe(id, () => {});
    await flushMicrotasks();
    expect(runtime.getInstance(id)).not.toBeNull();
    unsubscribe2();
    await flushMicrotasks();
    expect(runtime.getInstance(id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Outlet notFoundComponent — host-supplied component renders when a zone
// resolves to a module/entry pair the runtime doesn't know.
// ---------------------------------------------------------------------------

describe("notFoundComponent", () => {
  it("renders the host-supplied not-found component when a module-entry is missing", () => {
    type State = {};
    const def = defineComposition<{}, State>()({
      id: "nf",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: {
          select: () => ({
            kind: "module-entry",
            module: "ghost",
            entry: "missing",
          }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("nf", undefined);
    const NotFound = vi.fn(({ moduleId, entry }: { moduleId: string; entry: string }) => (
      <div data-testid="custom-nf">
        missing {moduleId}.{entry}
      </div>
    ));
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="nf" instanceId={id} notFoundComponent={NotFound as never}>
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("custom-nf").textContent).toBe("missing ghost.missing");
    expect(NotFound).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Journey-zone resolution without a registered "journey" mount adapter —
// should render the error fallback with a clear message rather than
// crashing.
// ---------------------------------------------------------------------------

describe("journey-kind resolution without a registered adapter", () => {
  it("renders the host's errorComponent when no journey mount adapter is registered", () => {
    type State = {};
    const def = defineComposition<{}, State>()({
      id: "no-adapter",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        only: {
          select: () =>
            ({
              kind: "journey",
              handle: { id: "doesnt-matter" } as never,
              input: undefined,
            }) as never,
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("no-adapter", undefined);
    const ErrorView = ({ error }: { error: unknown }) => (
      <div data-testid="zone-err">{(error as Error).message}</div>
    );
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="no-adapter" instanceId={id} errorComponent={ErrorView}>
          {(zones) => <div>{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("zone-err").textContent).toMatch(
      /no mount adapter is registered for kind "journey"/,
    );
  });
});

// ---------------------------------------------------------------------------
// Two outlets on the same instanceId — both attach, dispatch reaches both.
// ---------------------------------------------------------------------------

describe("two outlets on the same instanceId", () => {
  it("renders both, propagates dispatches to both, and survives one unmount", async () => {
    interface State {
      readonly tick: number;
    }
    function Counter() {
      const tick = useCompositionState<State, number>((s) => s.tick);
      return <span>{tick}</span>;
    }
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        counter: defineEntry({ component: Counter, input: schema<void>() }),
      },
    });
    type Modules = { readonly panels: typeof mod };
    const def = defineComposition<Modules, State>()({
      id: "twins",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        only: {
          select: () => ({ kind: "module-entry", module: "panels", entry: "counter" }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("twins", undefined);
    const view = render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="twins" instanceId={id}>
          {(zones) => <div data-testid="first">{zones.only}</div>}
        </CompositionOutlet>
        <CompositionOutlet compositionId="twins" instanceId={id}>
          {(zones) => <div data-testid="second">{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("first").textContent).toBe("0");
    expect(screen.getByTestId("second").textContent).toBe("0");
    act(() => {
      runtime.dispatch<State>(id, { tick: 7 });
    });
    expect(screen.getByTestId("first").textContent).toBe("7");
    expect(screen.getByTestId("second").textContent).toBe("7");
    view.unmount();
    await flushMicrotasks();
    expect(runtime.getInstance(id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Outlet renders fine without any journey wiring when no zone returns a
// journey resolution — the journey runtime is no longer a peer dep, and
// compositions stays usable for layout-only flows.
// ---------------------------------------------------------------------------

describe("no journey adapter required for non-journey zones", () => {
  it("renders normally when zones don't return journey resolutions", () => {
    type State = {};
    const def = defineComposition<{}, State>()({
      id: "plain",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("plain", undefined);
    expect(() => {
      render(
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="plain" instanceId={id}>
            {(zones) => <div data-testid="root">{zones.only}</div>}
          </CompositionOutlet>
        </CompositionsProvider>,
      );
    }).not.toThrow();
    expect(screen.getByTestId("root")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// `notify` listener throws are surfaced via `options.onError` so a
// faulty external observer can be diagnosed without bringing the runtime
// into debug mode.
// ---------------------------------------------------------------------------

describe("listener throws routed through options.onError", () => {
  it("calls options.onError when a subscriber listener throws", () => {
    const onError = vi.fn();
    const def = defineComposition<{}, { tick: number }>()({
      id: "tick",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: { onError } } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("tick", undefined);
    runtime.subscribe(id, () => {
      throw new Error("listener boom");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      runtime.dispatch<{ tick: number }>(id, { tick: 1 });
    } finally {
      consoleError.mockRestore();
    }
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ phase: "lifecycle" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Cycle detection — a composition instance refuses to mount itself as a
// descendant. Simulates a journey step rendering its parent composition.
// ---------------------------------------------------------------------------

describe("composition cycle detection", () => {
  it("renders the errorComponent instead of stack-overflowing when an instance mounts itself", () => {
    interface State {}
    type Modules = { readonly self: ReturnType<typeof makeSelfModule> };

    // The panel renders a nested CompositionOutlet for THE SAME composition
    // instance — exactly the shape a journey-of-composition cycle produces
    // after the journey step renders.
    function makeSelfModule(getInstanceId: () => string, getRuntime: () => any) {
      return defineModule({
        id: "self",
        version: "1.0.0",
        entryPoints: {
          recurse: defineEntry({
            component: () => (
              <CompositionOutlet
                runtime={getRuntime()}
                compositionId="cycle"
                instanceId={getInstanceId() as never}
              >
                {(zones) => <div data-testid="inner">{zones.body}</div>}
              </CompositionOutlet>
            ),
            input: schema<void>(),
          }),
        },
      });
    }

    let cycleInstanceId = "";
    let cycleRuntime: any = null;
    const selfModule = makeSelfModule(
      () => cycleInstanceId,
      () => cycleRuntime,
    );
    const def = defineComposition<Modules, State>()({
      id: "cycle",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: {
          select: () => ({ kind: "module-entry", module: "self", entry: "recurse" }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { self: selfModule }, debug: false },
    );
    cycleRuntime = runtime;
    cycleInstanceId = runtime.start("cycle", undefined);

    expect(() => {
      render(
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="cycle" instanceId={cycleInstanceId}>
            {(zones) => <div data-testid="outer">{zones.body}</div>}
          </CompositionOutlet>
        </CompositionsProvider>,
      );
    }).not.toThrow();

    // The outer outlet renders normally; the recursive descendant outlet
    // detects the cycle and renders the default error fallback (the inner
    // <CompositionOutlet> in the recursing panel doesn't forward our custom
    // errorComponent — the point is that we get a recognizable error
    // rather than a stack overflow).
    expect(screen.getByTestId("outer")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/already in the render ancestry/);
  });
});
