/**
 * Regression coverage for the second review pass (the one that flagged
 * the hook-order violation in `ZoneRenderer` and the successor-clobber
 * race in the persistence pipeline). Each block maps to a finding from
 * that review.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  defineEntry,
  defineExit,
  defineModule,
  schema,
} from "@modular-react/core";
import { JourneyProvider } from "@modular-react/journeys";

import { defineComposition } from "./define-composition.js";
import { createCompositionRuntime } from "./runtime.js";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import { useCompositionState } from "./hooks.js";
import {
  createMemoryCompositionPersistence,
} from "./persistence.js";
import type {
  CompositionInstanceId,
  CompositionPersistence,
  RegisteredComposition,
  SerializedComposition,
} from "./types.js";

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
    // Initial render: selector threw, fallback rendered.
    expect(screen.queryByTestId("ok")).toBeNull();
    // Flip the state — selector now succeeds. The fix means the
    // additional hooks introduced on the recovery render don't crash
    // React's hook-count check.
    expect(() => {
      act(() => {
        runtime.dispatch<State>(id, { flaky: false });
      });
    }).not.toThrow();
    expect(screen.getByTestId("ok")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Successor-clobber regression — out-of-order save completion across an
// `end + restart` cycle. Per-key save serialization ensures the older
// instance's pending save lands before the successor's saves, regardless
// of the adapter's per-call ordering guarantees.
// ---------------------------------------------------------------------------

describe("persistence save ordering across end + restart", () => {
  interface DocState {
    readonly documentId: string;
    readonly counter: number;
  }
  const editorEntry = defineEntry({
    component: (() => null) as never,
    input: schema<{ documentId: string }>(),
  });
  const editorModuleFixture = defineModule({
    id: "editor",
    version: "1.0.0",
    exitPoints: { saved: defineExit() },
    entryPoints: { main: editorEntry },
  });
  type Modules = { readonly editor: typeof editorModuleFixture };
  const def = defineComposition<Modules, DocState>()({
    id: "editor",
    version: "1.0.0",
    initialState: (input: { documentId: string }) => ({
      documentId: input.documentId,
      counter: 0,
    }),
    zones: {
      main: {
        select: ({ state }) => ({
          kind: "module-entry",
          module: "editor",
          entry: "main",
          input: { documentId: state.documentId },
        }),
      },
    },
  });

  it("does not let a disposed record's late save clobber a successor's blob", async () => {
    // Adapter whose `save` resolves in the OPPOSITE order from how it
    // was called. Without per-key serialization the older record's
    // save would land last and overwrite the successor's state.
    const backend = new Map<string, SerializedComposition<DocState>>();
    const callOrder: number[] = [];
    let nextCallSeq = 0;
    const pendingSaves: Array<() => void> = [];

    const persistence: CompositionPersistence<DocState, { documentId: string }> = {
      keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
      load: (key) => backend.get(key) ?? null,
      save: (key, blob) => {
        const seq = ++nextCallSeq;
        return new Promise<void>((resolve) => {
          pendingSaves.push(() => {
            callOrder.push(seq);
            backend.set(key, blob);
            resolve();
          });
        });
      },
      remove: (key) => {
        backend.delete(key);
      },
    };

    const runtime = createCompositionRuntime(
      [{ definition: def, options: { persistence } } as RegisteredComposition],
      { modules: { editor: editorModuleFixture }, debug: false },
    );

    const a = runtime.start("editor", { documentId: "doc-1" });
    await flushMicrotasks();
    runtime.dispatch<DocState>(a, { counter: 1 });
    runtime.end(a);

    const b = runtime.start("editor", { documentId: "doc-1" });
    expect(b).not.toBe(a);
    await flushMicrotasks();
    runtime.dispatch<DocState>(b, { counter: 99 });

    // Fire pending saves in REVERSE order so the older saves resolve
    // last. Per-key serialization should still ensure they land in
    // chained order under the same key.
    for (const release of [...pendingSaves].reverse()) {
      release();
      await flushMicrotasks();
    }
    // Drain any saves that were queued as a result of a prior save's
    // `pendingSave` re-trigger.
    while (pendingSaves.length > 0) {
      const next = pendingSaves.shift()!;
      next();
      await flushMicrotasks();
    }

    expect(backend.get("editor:doc-1")?.state.counter).toBe(99);
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
    zones: { only: { select: () => ({ kind: "empty" } as const) } },
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
    // Microtask flushes — disposal microtask fires.
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
    // Synchronous re-subscribe before the microtask drain.
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
        <CompositionOutlet
          compositionId="nf"
          instanceId={id}
          notFoundComponent={NotFound as never}
        >
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("custom-nf").textContent).toBe("missing ghost.missing");
    expect(NotFound).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Journey-zone resolution without a JourneyProvider — should render the
// error fallback with a clear message rather than crashing.
// ---------------------------------------------------------------------------

describe("journey-kind resolution without JourneyProvider", () => {
  it("renders the host's errorComponent when no JourneyProvider is mounted", () => {
    type State = {};
    const def = defineComposition<{}, State>()({
      id: "no-provider",
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
    const id = runtime.start("no-provider", undefined);
    const ErrorView = ({ error }: { error: unknown }) => (
      <div data-testid="zone-err">{(error as Error).message}</div>
    );
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet
          compositionId="no-provider"
          instanceId={id}
          errorComponent={ErrorView}
        >
          {(zones) => <div>{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("zone-err").textContent).toMatch(/no <JourneyProvider>/);
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
    // Unmount the host entirely — the disposal microtask should fire
    // and the instance should be gone.
    view.unmount();
    await flushMicrotasks();
    expect(runtime.getInstance(id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadingFallback renders while persistence load is pending.
// ---------------------------------------------------------------------------

describe("loadingFallback during persistence load", () => {
  it("renders the loadingFallback while status === 'loading'", async () => {
    type State = { readonly tick: number };
    let resolveLoad!: (blob: SerializedComposition<State> | null) => void;
    const loadPending = new Promise<SerializedComposition<State> | null>((res) => {
      resolveLoad = res;
    });
    const persistence: CompositionPersistence<State, void> = {
      keyFor: ({ compositionId }) => `${compositionId}:singleton`,
      load: () => loadPending,
      save: () => {
        /* noop */
      },
      remove: () => {
        /* noop */
      },
    };
    const def = defineComposition<{}, State>()({
      id: "slow",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: { only: { select: () => ({ kind: "empty" } as const) } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: { persistence } } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("slow", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet
          compositionId="slow"
          instanceId={id}
          loadingFallback={<div data-testid="loading">loading…</div>}
        >
          {(zones) => <div>{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("loading")).toBeTruthy();
    await act(async () => {
      resolveLoad(null);
      await flushMicrotasks();
    });
    expect(screen.queryByTestId("loading")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Outlet renders without a JourneyProvider when no zone declares a
// journey resolution — the journey runtime is a peer dep but shouldn't
// be required at runtime for non-journey zones.
// ---------------------------------------------------------------------------

describe("no JourneyProvider required for non-journey zones", () => {
  it("renders normally when zones don't return journey resolutions", () => {
    type State = {};
    const def = defineComposition<{}, State>()({
      id: "plain",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" } as const) } },
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
      zones: { only: { select: () => ({ kind: "empty" } as const) } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: { onError } } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("tick", undefined);
    runtime.subscribe(id, () => {
      throw new Error("listener boom");
    });
    // Silence the unconditional console.error that the runtime now
    // emits for listener throws.
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
// pending-dispatch replay errors are surfaced via onError.
// ---------------------------------------------------------------------------

describe("queued-dispatch errors during load replay", () => {
  it("routes a queued updater throw to options.onError", async () => {
    interface State {
      readonly counter: number;
    }
    const onError = vi.fn();
    const persistence: CompositionPersistence<State, void> = {
      keyFor: ({ compositionId }) => `${compositionId}:single`,
      load: () => null,
      save: () => {
        /* noop */
      },
      remove: () => {
        /* noop */
      },
    };
    const def = defineComposition<{}, State>()({
      id: "queued",
      version: "1.0.0",
      initialState: () => ({ counter: 0 }),
      zones: { only: { select: () => ({ kind: "empty" } as const) } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: { persistence, onError } } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("queued", undefined);
    runtime.dispatch<State>(id, () => {
      throw new Error("queued boom");
    });
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ phase: "lifecycle" }),
    );
  });
});
