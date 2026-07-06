/**
 * Outlet-level behavior fixes shipped alongside the first review pass.
 */

import { StrictMode, useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { RuntimeMountAdapter } from "@modular-react/core";

import { defineComposition } from "@modular-frontend/compositions-engine";
import { createCompositionRuntime } from "@modular-frontend/compositions-engine";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import { CompositionInstanceContext, useCompositionState } from "./hooks.js";
import type { CompositionContextValue } from "./hooks.js";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";

afterEach(() => {
  cleanup();
});

interface PanelState {
  readonly tick: number;
  readonly throwOn: number | null;
  readonly errorPolicy: "fallback" | "ignore" | "retry";
}

// A panel that publishes the latest contextValue reference it observed.
// Used to verify the memoization contract: identity is stable across
// composition state changes.
const seenContextValues: Array<CompositionContextValue | null> = [];
function ContextSpyPanel() {
  const ctx = useContext(CompositionInstanceContext);
  seenContextValues.push(ctx);
  return <div data-testid="ctx-spy">spy</div>;
}

function ThrowOnTickPanel() {
  const tick = useCompositionState<PanelState, number>((s) => s.tick);
  const throwOn = useCompositionState<PanelState, number | null>((s) => s.throwOn);
  if (throwOn !== null && tick === throwOn) {
    throw new Error(`boom at ${tick}`);
  }
  return <div data-testid="throw-on-tick">tick={tick}</div>;
}

const module = defineModule({
  id: "panels",
  version: "1.0.0",
  exitPoints: { done: defineExit() },
  entryPoints: {
    ctxSpy: defineEntry({
      component: ContextSpyPanel as never,
      input: schema<void>(),
    }),
    throwOnTick: defineEntry({
      component: ThrowOnTickPanel as never,
      input: schema<void>(),
    }),
  },
});

type Modules = { readonly panels: typeof module };

const composition = defineComposition<Modules, PanelState>()({
  id: "panels",
  version: "1.0.0",
  initialState: () => ({ tick: 0, throwOn: null, errorPolicy: "fallback" as const }),
  zones: {
    a: {
      select: () => ({ kind: "module-entry", module: "panels", entry: "ctxSpy" }),
    },
    b: {
      select: () => ({
        kind: "module-entry",
        module: "panels",
        entry: "throwOnTick",
        input: undefined,
      }),
    },
  },
  onZoneError: (_err, ctx) => ctx.state.errorPolicy,
});

function makeRuntime() {
  return createCompositionRuntime(
    [{ definition: composition, options: undefined } as RegisteredComposition],
    { modules: { panels: module }, debug: false },
  );
}

// ---------------------------------------------------------------------------
// #4 — contextValue identity is stable across state changes
// ---------------------------------------------------------------------------

describe("contextValue stability", () => {
  it("keeps contextValue identity stable across composition state changes", () => {
    const runtime = makeRuntime();
    const id = runtime.start("panels", undefined);
    seenContextValues.length = 0;
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="panels" instanceId={id}>
          {(zones) => <div>{zones.a}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    const initialValue = seenContextValues[seenContextValues.length - 1];
    expect(initialValue).not.toBeNull();
    // 5 dispatches that mutate state. ZoneRenderer re-renders each time
    // (it reads state via useSyncExternalStore), but the contextValue
    // identity must NOT change — that's the contract foreign panels
    // wrap themselves in React.memo against.
    for (let i = 1; i <= 5; i++) {
      act(() => {
        runtime.dispatch<PanelState>(id, { tick: i });
      });
    }
    for (const seen of seenContextValues) {
      expect(seen).toBe(initialValue);
    }
  });
});

// ---------------------------------------------------------------------------
// #5 — Retry counter resets on a new (working) selectionKey
// ---------------------------------------------------------------------------

describe("retry counter reset on resolution change", () => {
  it("recovers from an exhausted retry budget when the resolution changes", () => {
    // Use a composition whose zone resolution flips between two entries
    // based on state — one always throws, the other never does.
    type State = { readonly mode: "broken" | "ok" };
    function BrokenPanel(): never {
      throw new Error("always-bad");
    }
    function OkPanel() {
      return <div data-testid="ok">ok</div>;
    }
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        broken: defineEntry({ component: BrokenPanel as never, input: schema<void>() }),
        ok: defineEntry({ component: OkPanel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, State>()({
      id: "switch",
      version: "1.0.0",
      initialState: () => ({ mode: "broken" as const }),
      zones: {
        body: {
          select: ({ state }) => ({
            kind: "module-entry",
            module: "panels",
            entry: state.mode === "broken" ? "broken" : "ok",
          }),
        },
      },
      onZoneError: () => "retry" as const,
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("switch", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="switch" instanceId={id} retryLimit={1}>
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    // The broken panel exhausts the retry budget (default fallback rendered).
    // Switch the resolution → boundary remounts, retry counter resets,
    // ok panel renders.
    act(() => {
      runtime.dispatch<State>(id, { mode: "ok" });
    });
    expect(screen.getByTestId("ok")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// #12 — Ignore policy renders null instead of the error UI
// ---------------------------------------------------------------------------

describe("onZoneError = 'ignore' renders null", () => {
  it("suppresses the error UI when the policy returns 'ignore'", () => {
    const runtime = makeRuntime();
    const id = runtime.start("panels", undefined);
    act(() => {
      runtime.dispatch<PanelState>(id, { errorPolicy: "ignore", throwOn: 5, tick: 5 });
    });
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="panels" instanceId={id}>
          {(zones) => <div data-testid="root">{zones.b}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    // No error chrome rendered; root is empty.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("root").textContent).toBe("");
  });
});

// ---------------------------------------------------------------------------
// #3 — Journey-kind resolution caches the minted instanceId per (handle, input)
// ---------------------------------------------------------------------------

describe("journey-zone instance caching", () => {
  it("does not mint a new journey instance on every composition state change", () => {
    interface MockHandle {
      readonly id: string;
    }
    const startSpy = vi.fn((_definitionId: string, _input: unknown) => "ji_mock");
    // Minimal RuntimeMountAdapter — proves the outlet talks to whatever
    // is registered for "journey", with no dependency on the journeys
    // package itself. The Outlet component is a no-op div so the
    // useSyncExternalStore wiring of the real JourneyOutlet isn't part
    // of the test surface.
    const fakeAdapter: RuntimeMountAdapter = {
      start: startSpy,
      Outlet: () => <div data-testid="journey-outlet" />,
    };

    type State = { readonly tick: number };
    const def = defineComposition<{}, State>()({
      id: "j-zone",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        only: {
          select: () =>
            ({
              kind: "journey",
              handle: { id: "h" } as MockHandle as never,
              input: undefined,
            }) as never,
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    runtime.registerMountAdapter("journey", fakeAdapter);
    const id = runtime.start("j-zone", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="j-zone" instanceId={id}>
          {(zones) => <div>{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    const baselineCalls = startSpy.mock.calls.length;
    expect(baselineCalls).toBeGreaterThanOrEqual(1);
    // Dispatch a flurry of composition state changes — the selector
    // returns the same handle+input every time, so additional calls to
    // start() should be zero. We assert against the baseline rather
    // than `===1` because React 19's strict-mode-free dev render can
    // call the component function more than once before commit; what
    // matters is that further dispatches don't grow the count.
    for (let i = 1; i <= 5; i++) {
      act(() => {
        runtime.dispatch<State>(id, { tick: i });
      });
    }
    expect(startSpy.mock.calls.length).toBe(baselineCalls);
  });
});

// ---------------------------------------------------------------------------
// StrictMode disposal — make sure the microtask guard still keeps the
// instance alive across mount/unmount/mount.
// ---------------------------------------------------------------------------

describe("StrictMode survival", () => {
  it("does not dispose the instance during a StrictMode mount cycle", async () => {
    const runtime = makeRuntime();
    const id = runtime.start("panels", undefined);
    render(
      <StrictMode>
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="panels" instanceId={id}>
            {(zones) => <div data-testid="root">{zones.a}</div>}
          </CompositionOutlet>
        </CompositionsProvider>
      </StrictMode>,
    );
    // Allow the microtask queue to drain.
    await Promise.resolve();
    expect(runtime.getInstance(id)?.status).toBe("active");
  });
});
