/**
 * Regression coverage for the PR-review-driven fixes:
 *
 *   - Cycle guard's depth cap catches cross-instance recursion through
 *     the same composition definition (different instance ids).
 *   - `dispatch` from inside `onDispose` / `onUnmount` is a no-op
 *     because the `disposing` flag flips before the hooks fire.
 *   - `hydrateComposition` returns a `{ instanceId, release }` handle;
 *     the instance survives outlet mount/unmount until release is
 *     called, after which the disposal gate runs normally.
 *   - `NOOP_EXIT` warns in dev when a panel reused in a composition
 *     zone calls `exit(...)`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineModule, schema } from "@modular-react/core";

import { defineComposition } from "./define-composition.js";
import { createCompositionRuntime, hydrateComposition } from "./runtime.js";
import { CompositionOutlet, __resetNoopExitWarned } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import type {
  CompositionInstanceId,
  RegisteredComposition,
  SerializedComposition,
} from "./types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// ---------------------------------------------------------------------------
// Cycle guard: hard cap on definition recursion depth
// ---------------------------------------------------------------------------

describe("definition-depth cycle cap", () => {
  it("renders the error fallback once the same definition nests beyond the depth cap", () => {
    // Each render of the recurse panel mounts a NEW outlet for a fresh
    // instance of the same composition definition. Different instance
    // ids per hop, so the same-instance guard misses it; the depth
    // counter catches it once depth >= 8.
    interface CompositionId {
      readonly id: string;
    }
    let registry: { runtime: ReturnType<typeof createCompositionRuntime>; mintId: () => string };

    // Mutually-recursive declaration: the module renders an outlet that
    // mounts a fresh instance of the same composition. The fresh id is
    // produced by `runtime.start` so each hop is a distinct
    // instanceId, exercising the depth-cap path rather than the
    // same-instance guard.
    function RecursePanel(): React.ReactNode {
      const id = registry.mintId();
      return (
        <CompositionOutlet
          runtime={registry.runtime as never}
          compositionId="depth-cycle"
          instanceId={id as never}
        >
          {(zones) => <div data-testid={`hop-${id}`}>{zones.body}</div>}
        </CompositionOutlet>
      );
    }

    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        recurse: defineEntry({ component: RecursePanel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, CompositionId>()({
      id: "depth-cycle",
      version: "1.0.0",
      initialState: (input: { id: string }) => ({ id: input.id }),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "panels", entry: "recurse" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    registry = {
      runtime,
      mintId: () => runtime.start("depth-cycle", { id: Math.random().toString(36).slice(2, 8) }),
    };
    const rootId = runtime.start("depth-cycle", { id: "root" });

    // React's error path logs via console.error; quiet it for the test.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="depth-cycle" instanceId={rootId}>
            {(zones) => <div data-testid="root">{zones.body}</div>}
          </CompositionOutlet>
        </CompositionsProvider>,
      );
    } finally {
      consoleError.mockRestore();
    }
    // Somewhere down the chain the depth cap fires and renders the
    // default error fallback — the cap is 8, and we'd otherwise stack
    // overflow before reaching the assertion.
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1);
    // The message names the composition id so authors can find the
    // offending layout quickly.
    const messages = screen
      .getAllByRole("alert")
      .map((node) => node.textContent ?? "")
      .join("\n");
    expect(messages).toMatch(/nested inside itself/);
    expect(messages).toMatch(/depth-cycle/);
  });
});

// ---------------------------------------------------------------------------
// Dispatch is silently ignored during disposal
// ---------------------------------------------------------------------------

describe("dispatch gated by disposing flag", () => {
  it("a dispatch from inside onUnmount does not mutate state or notify listeners", () => {
    interface State {
      readonly counter: number;
    }
    let runtimeRef: ReturnType<typeof createCompositionRuntime>;
    let idRef: CompositionInstanceId;
    const observedDuringHook: number[] = [];
    const def = defineComposition<{}, State>()({
      id: "disposing-gate",
      version: "1.0.0",
      initialState: () => ({ counter: 0 }),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
      lifecycle: {
        onUnmount(state) {
          observedDuringHook.push(state.counter);
          // Try to dispatch — the gate should ignore this. If the
          // gate didn't exist, this would mutate state mid-disposal
          // and the terminal snapshot would carry counter=99 instead
          // of the original.
          runtimeRef.dispatch<State>(idRef, { counter: 99 });
        },
      },
    });
    runtimeRef = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    idRef = runtimeRef.start("disposing-gate", undefined);
    runtimeRef.dispatch<State>(idRef, { counter: 7 });

    const subscriberSeen: Array<State["counter"] | "gone"> = [];
    runtimeRef.subscribe(idRef, () => {
      const snap = runtimeRef.getInstance<State>(idRef);
      subscriberSeen.push(snap ? snap.state.counter : "gone");
    });

    runtimeRef.end(idRef, { reason: "test" });

    // Hook observed counter=7 (the live value at disposal start).
    expect(observedDuringHook).toEqual([7]);
    // Subscriber's final fire shows counter=7, NOT 99 — the dispatch
    // from inside onUnmount was suppressed.
    expect(subscriberSeen.length).toBeGreaterThanOrEqual(1);
    expect(subscriberSeen[subscriberSeen.length - 1]).not.toBe(99);
  });
});

// ---------------------------------------------------------------------------
// hydrateComposition handle survives outlet remounts
// ---------------------------------------------------------------------------

describe("hydrateComposition hold survives outlet remounts", () => {
  it("hydrated instance is not disposed when the only outlet unmounts", async () => {
    const def = defineComposition<{}, { docId: string }>()({
      id: "hold",
      version: "1.0.0",
      initialState: () => ({ docId: "" }),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const blob: SerializedComposition<{ docId: string }> = {
      definitionId: "hold",
      version: "1.0.0",
      instanceId: "ci_held" as CompositionInstanceId,
      state: { docId: "ssr-seed" },
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const handle = hydrateComposition(runtime, "hold", blob);
    expect(handle.instanceId).toBe("ci_held");

    // Mount and unmount an outlet — the instance must survive.
    const view = render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="hold" instanceId={handle.instanceId}>
          {(zones) => <div data-testid="root">{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    view.unmount();
    await flushMicrotasks();
    expect(runtime.getInstance(handle.instanceId)).not.toBeNull();
    expect(runtime.getInstance(handle.instanceId)?.state).toEqual({ docId: "ssr-seed" });

    // Now release — disposal gate kicks in and the instance goes away.
    handle.release();
    await flushMicrotasks();
    expect(runtime.getInstance(handle.instanceId)).toBeNull();
  });

  it("release() is idempotent", async () => {
    const def = defineComposition<{}, {}>()({
      id: "hold-idem",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const blob: SerializedComposition<{}> = {
      definitionId: "hold-idem",
      version: "1.0.0",
      instanceId: "ci_idem" as CompositionInstanceId,
      state: {},
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const handle = hydrateComposition(runtime, "hold-idem", blob);
    handle.release();
    handle.release(); // no-op
    handle.release(); // no-op
    await flushMicrotasks();
    expect(runtime.getInstance(handle.instanceId)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NOOP_EXIT dev-warn — panels that try to call exit get a clear message
// ---------------------------------------------------------------------------

describe("NOOP_EXIT dev-warn", () => {
  it("warns once per exit name when a composition panel calls exit()", () => {
    const ExitCallingPanel = ({ exit }: { exit: (name: string) => void }) => {
      // Mimic a journey-shaped panel reused inside a composition zone.
      // The exit prop is typed as `never` so this still compiles only
      // because the framework hands NOOP_EXIT through `as never`.
      exit("done");
      return <div data-testid="exit-call">called exit</div>;
    };
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        main: defineEntry({ component: ExitCallingPanel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, {}>()({
      id: "noop-exit",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "panels", entry: "main" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("noop-exit", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="noop-exit" instanceId={id}>
            {(zones) => <div>{zones.body}</div>}
          </CompositionOutlet>
        </CompositionsProvider>,
      );
      // The panel renders despite calling exit — exit is a no-op.
      expect(screen.getByTestId("exit-call")).toBeTruthy();
      // The dev-warn fired with the exit name in the message.
      expect(warn).toHaveBeenCalled();
      const messages = warn.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => m.includes('"done"'))).toBe(true);
      expect(messages.some((m) => m.includes("useCompositionDispatch"))).toBe(true);

      // Re-render: same exit name → warn does NOT fire again (once-per-name latch).
      warn.mockClear();
      act(() => {
        runtime.dispatch(id, {});
      });
      // No new warn for the same exit name.
      const reMessages = warn.mock.calls.map((c) => String(c[0]));
      expect(reMessages.some((m) => m.includes('"done"'))).toBe(false);

      // `__resetNoopExitWarned()` clears the latch so a subsequent
      // exit call for the same name re-fires the warn. This is the
      // test-isolation escape hatch: without it, a test suite that
      // exercises exit("done") more than once would only see the
      // warn from the first case.
      warn.mockClear();
      __resetNoopExitWarned();
      act(() => {
        runtime.dispatch(id, {});
      });
      const postResetMessages = warn.mock.calls.map((c) => String(c[0]));
      expect(postResetMessages.some((m) => m.includes('"done"'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
