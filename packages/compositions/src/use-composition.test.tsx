/**
 * Regression coverage for the third review pass:
 *
 *   - `subscribe`/`dispatch` against a disposed (or never-known) instance
 *     are silent no-ops.
 *   - The journey-zone cache is bounded and rolls over via `adapter.end`.
 *   - `registerMountAdapter` warns when overwriting in debug mode.
 *   - `hashInput` is order-stable across `{a,b}` vs `{b,a}` (verified
 *     indirectly: a cache that would otherwise mint a new instance per
 *     reorder must stay at one `start` call).
 *   - `endInstance` fires unmount hooks while status is still active.
 *   - Module-entry `selectionKey` includes input — boundary remounts on
 *     input change.
 *   - Direct `createCompositionRuntime` invocation runs contract
 *     validation against the module map.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  defineEntry,
  defineExit,
  defineExitContract,
  defineModule,
  schema,
} from "@modular-react/core";
import type { RuntimeMountAdapter } from "@modular-react/core";

import { defineComposition } from "@modular-frontend/compositions-engine";
import { createCompositionRuntime } from "@modular-frontend/compositions-engine";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import { CompositionValidationError } from "@modular-frontend/compositions-engine";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";

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
// Runtime sanity: dispatch / subscribe on disposed or unknown instances
// ---------------------------------------------------------------------------

describe("runtime no-ops on disposed/unknown instances", () => {
  const trivial = defineComposition<{}, { tick: number }>()({
    id: "trivial",
    version: "1.0.0",
    initialState: () => ({ tick: 0 }),
    zones: { only: { select: () => ({ kind: "empty" }) as const } },
  });

  it("dispatch on a disposed instance is a no-op", () => {
    const runtime = createCompositionRuntime(
      [{ definition: trivial, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("trivial", undefined);
    runtime.end(id);
    expect(() => runtime.dispatch<{ tick: number }>(id, { tick: 99 })).not.toThrow();
    expect(runtime.getInstance(id)).toBeNull();
  });

  it("subscribe on an unknown instance returns a no-op unsubscribe", () => {
    const runtime = createCompositionRuntime(
      [{ definition: trivial, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const unsub = runtime.subscribe("ci_does_not_exist" as never, () => {});
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Adapter overwrite warns in debug
// ---------------------------------------------------------------------------

describe("registerMountAdapter overwrite warning", () => {
  it("warns when replacing an existing adapter in debug mode", () => {
    const trivial = defineComposition<{}, {}>()({
      id: "trivial-warn",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = createCompositionRuntime(
      [{ definition: trivial, options: undefined } as RegisteredComposition],
      { modules: {}, debug: true },
    );
    const a: RuntimeMountAdapter = { start: () => "x", Outlet: () => null };
    const b: RuntimeMountAdapter = { start: () => "y", Outlet: () => null };
    runtime.registerMountAdapter("journey", a);
    runtime.registerMountAdapter("journey", b);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/replaced an existing adapter/);
    expect(runtime.getMountAdapter("journey")).toBe(b);
  });

  it("does not warn when debug is off", () => {
    const trivial = defineComposition<{}, {}>()({
      id: "trivial-quiet",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = createCompositionRuntime(
      [{ definition: trivial, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const a: RuntimeMountAdapter = { start: () => "x", Outlet: () => null };
    runtime.registerMountAdapter("journey", a);
    runtime.registerMountAdapter("journey", a);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Direct construction also runs contract validation
// ---------------------------------------------------------------------------

describe("createCompositionRuntime contract validation", () => {
  it("throws when a zone contract is unsatisfied by the supplied modules", () => {
    const closeContract = defineExitContract<{ ok: boolean }>("close");
    const editor = defineModule({ id: "editor", version: "1.0.0", exitPoints: {} });
    type Mods = { readonly editor: typeof editor };
    const def = defineComposition<Mods, {}>()({
      id: "needs-contract",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        a: { select: () => ({ kind: "empty" }), contract: closeContract },
      },
    });
    expect(() =>
      createCompositionRuntime(
        [{ definition: def as never, options: undefined } as RegisteredComposition],
        { modules: { editor }, debug: false },
      ),
    ).toThrow(CompositionValidationError);
  });
});

// ---------------------------------------------------------------------------
// Journey-zone cache is bounded and rolls over via adapter.end
// ---------------------------------------------------------------------------

describe("journey-zone cache rollover", () => {
  it("ends the previous journey instance when a different (handle,input) is resolved", () => {
    interface State {
      readonly id: string;
    }
    const startSpy = vi.fn((defId: string, input: { n: number }) => `ji_${defId}_${input.n}`);
    const endSpy = vi.fn();
    const adapter: RuntimeMountAdapter = {
      start: startSpy as never,
      end: endSpy,
      Outlet: () => <div data-testid="journey" />,
    };
    const def = defineComposition<{}, State>()({
      id: "journey-rollover",
      version: "1.0.0",
      initialState: () => ({ id: "a" }),
      zones: {
        only: {
          select: ({ state }) =>
            ({
              kind: "journey",
              handle: { id: state.id } as never,
              input: { n: state.id === "a" ? 1 : 2 },
            }) as never,
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    runtime.registerMountAdapter("journey", adapter);
    const id = runtime.start("journey-rollover", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="journey-rollover" instanceId={id}>
          {(zones) => <div>{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    const startsBefore = startSpy.mock.calls.length;
    expect(startsBefore).toBeGreaterThanOrEqual(1);

    act(() => {
      runtime.dispatch<State>(id, { id: "b" });
    });
    // Rollover: a new start happened, and end was called for the
    // previously-cached instance.
    expect(startSpy.mock.calls.length).toBeGreaterThan(startsBefore);
    expect(endSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hashInput is order-stable (verified through the journey cache)
// ---------------------------------------------------------------------------

describe("hashInput order-stability", () => {
  it("does not mint a new instance when an input's key order differs", () => {
    interface State {
      readonly reorder: boolean;
    }
    const startSpy = vi.fn(() => "ji_only");
    const adapter: RuntimeMountAdapter = {
      start: startSpy as never,
      end: () => {},
      Outlet: () => <div data-testid="journey" />,
    };
    const def = defineComposition<{}, State>()({
      id: "hash-stable",
      version: "1.0.0",
      initialState: () => ({ reorder: false }),
      zones: {
        only: {
          select: ({ state }) => {
            // Two object spellings of the same logical input. The hash
            // sort-keys before stringifying, so both must produce the
            // same cache key.
            const input = state.reorder ? { b: 2, a: 1 } : { a: 1, b: 2 };
            return {
              kind: "journey",
              handle: { id: "h" } as never,
              input,
            } as never;
          },
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    runtime.registerMountAdapter("journey", adapter);
    const id = runtime.start("hash-stable", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="hash-stable" instanceId={id}>
          {(zones) => <div>{zones.only}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    const baseline = startSpy.mock.calls.length;
    expect(baseline).toBeGreaterThanOrEqual(1);
    act(() => {
      runtime.dispatch<State>(id, { reorder: true });
    });
    expect(startSpy.mock.calls.length).toBe(baseline);
  });
});

// ---------------------------------------------------------------------------
// endInstance fires unmount hook while status is still "active"
// ---------------------------------------------------------------------------

describe("lifecycle.onUnmount sees status active", () => {
  it("unmount hook reads getInstance status as active", () => {
    const seenStatuses: string[] = [];
    // Use ref-objects so the lifecycle closure can read the runtime
    // and instance id after they're assigned — both are declared after
    // the definition because the definition is what the runtime is
    // built from.
    const runtimeRef: { current: ReturnType<typeof createCompositionRuntime> | null } = {
      current: null,
    };
    const idRef: { current: string } = { current: "" };
    const def = defineComposition<{}, { tick: number }>()({
      id: "ordering",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
      lifecycle: {
        onUnmount() {
          const snap = runtimeRef.current?.getInstance(idRef.current);
          seenStatuses.push(snap?.status ?? "<gone>");
        },
      },
    });
    runtimeRef.current = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    idRef.current = runtimeRef.current.start("ordering", undefined);
    runtimeRef.current.end(idRef.current, { reason: "test" });
    expect(seenStatuses).toEqual(["active"]);
  });
});

// ---------------------------------------------------------------------------
// Module-entry selectionKey includes input → boundary remounts on input
// change so a previous error doesn't survive
// ---------------------------------------------------------------------------

describe("module-entry selectionKey includes input", () => {
  it("remounts the boundary when input changes, clearing a prior error", () => {
    interface State {
      readonly value: number;
    }
    // Deterministic throw: input.v === 1 always throws. Switching to
    // v === 2 must produce a different selectionKey so the boundary
    // remounts; otherwise the boundary stays in error state because
    // its `state.error` only clears on remount.
    function Flaky({ input }: { input: { v: number } }) {
      if (input.v === 1) throw new Error(`boom@${input.v}`);
      return <div data-testid="ok">{input.v}</div>;
    }
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      exitPoints: { done: defineExit() },
      entryPoints: {
        flaky: defineEntry({
          component: Flaky as never,
          input: schema<{ v: number }>(),
        }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, State>()({
      id: "remount-on-input",
      version: "1.0.0",
      initialState: () => ({ value: 1 }),
      zones: {
        body: {
          select: ({ state }) => ({
            kind: "module-entry",
            module: "panels",
            entry: "flaky",
            input: { v: state.value },
          }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("remount-on-input", undefined);
    // The first render throws and surfaces as the default error UI;
    // happy-dom's console.error pipeline is noisy, mute it for this test.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="remount-on-input" instanceId={id}>
            {(zones) => <div data-testid="root">{zones.body}</div>}
          </CompositionOutlet>
        </CompositionsProvider>,
      );
      expect(screen.queryByTestId("ok")).toBeNull();
      expect(screen.getByRole("alert")).toBeTruthy();
      act(() => {
        runtime.dispatch<State>(id, { value: 2 });
      });
      expect(screen.getByTestId("ok").textContent).toBe("2");
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Provider value identity is stable across re-renders (no fanout)
// ---------------------------------------------------------------------------

describe("CompositionsProvider value identity", () => {
  it("preserves the provider value reference across parent re-renders", async () => {
    const { useCompositionsContext } = await import("./provider.js");
    const seen: Array<unknown> = [];
    function Probe() {
      seen.push(useCompositionsContext());
      return <div data-testid="probe" />;
    }
    const trivial = defineComposition<{}, {}>()({
      id: "stable-ctx",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: trivial, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    function Wrapper({ tick }: { tick: number }) {
      return (
        <CompositionsProvider runtime={runtime}>
          <span data-testid="t" data-tick={tick} />
          <Probe />
        </CompositionsProvider>
      );
    }
    const view = render(<Wrapper tick={0} />);
    view.rerender(<Wrapper tick={1} />);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Every observed context value must be the same object instance.
    const first = seen[0];
    for (const v of seen) expect(v).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// Plugin reuse guard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// useComposition — lazy ref start + outlet refcount disposal
// ---------------------------------------------------------------------------

describe("useComposition", () => {
  it("starts an instance once per mount and exposes the id", async () => {
    const { useComposition } = await import("./hooks.js");
    const def = defineComposition<{}, { tick: number }>()({
      id: "use-comp-once",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    function Host() {
      const id = useComposition("use-comp-once", undefined);
      return <div data-testid="id">{id}</div>;
    }
    render(
      <CompositionsProvider runtime={runtime}>
        <Host />
      </CompositionsProvider>,
    );
    const id = screen.getByTestId("id").textContent!;
    expect(id).toMatch(/^ci_/);
    expect(runtime.getInstance(id)).not.toBeNull();
  });

  it("relies on the outlet's refcount for disposal — instance survives until outlet unmounts", async () => {
    const { useComposition } = await import("./hooks.js");
    const def = defineComposition<{}, {}>()({
      id: "use-comp-dispose",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    let captured: string = "";
    function Host() {
      const id = useComposition("use-comp-dispose", undefined);
      captured = id;
      return (
        <CompositionOutlet compositionId="use-comp-dispose" instanceId={id}>
          {(zones) => <div data-testid="root">{zones.only}</div>}
        </CompositionOutlet>
      );
    }
    const view = render(
      <CompositionsProvider runtime={runtime}>
        <Host />
      </CompositionsProvider>,
    );
    // Alive while mounted.
    expect(runtime.getInstance(captured)).not.toBeNull();
    view.unmount();
    await flushMicrotasks();
    // Outlet's detach microtask disposed it.
    expect(runtime.getInstance(captured)).toBeNull();
  });

  it("throws a clear error when used without a runtime / provider", async () => {
    const { useComposition } = await import("./hooks.js");
    function Host() {
      useComposition("missing", undefined);
      return null;
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Host />)).toThrow(/needs a runtime/);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("compositionsPlugin reuse guard", () => {
  it("throws when the same plugin instance is resolved twice", async () => {
    // The plugin guard fires on the second `onResolve`. We exercise the
    // hooks directly rather than going through the framework's registry
    // assembly so the test stays free of router-runtime fixtures.
    const { compositionsPlugin } = await import("./plugin.js");
    const plugin = compositionsPlugin();
    plugin.onResolve!({ modules: [], moduleDescriptors: {}, debug: false });
    expect(() => plugin.onResolve!({ modules: [], moduleDescriptors: {}, debug: false })).toThrow(
      /resolved twice/,
    );
  });

  it("throws when registerComposition is called after onResolve", async () => {
    const { compositionsPlugin } = await import("./plugin.js");
    const plugin = compositionsPlugin();
    const ext = plugin.extend({ markDirty: () => {} }) as {
      registerComposition: (def: unknown) => void;
    };
    plugin.onResolve!({ modules: [], moduleDescriptors: {}, debug: false });
    const def = defineComposition<{}, {}>()({
      id: "late",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { only: { select: () => ({ kind: "empty" }) as const } },
    });
    expect(() => ext.registerComposition(def)).toThrow(/after the plugin already resolved/);
  });
});

// ---------------------------------------------------------------------------
// useCompositionState — derived-object selectors don't tear
// ---------------------------------------------------------------------------

describe("useCompositionState derived-object selectors", () => {
  it("does not tear when the selector returns a fresh object on each call", async () => {
    // React calls `getSnapshot` on every render and compares with
    // `Object.is`. A naive `useSyncExternalStore` wiring would invoke
    // a fresh-object-returning selector each time, fail the identity
    // check, and either log "The result of getSnapshot should be
    // cached" or loop. The hook's internal cache keys results on the
    // store-state reference, so the same selector applied to the same
    // state returns the same object identity.
    const { useCompositionState } = await import("./hooks.js");
    interface S {
      readonly a: number;
      readonly b: number;
    }
    function Panel() {
      // Selector returns a fresh object each call but reads the same
      // slices. The wrapper hook must cache it on state identity.
      const slice = useCompositionState<S, { readonly sum: number }>((s) => ({ sum: s.a + s.b }));
      return <div data-testid="slice">{slice.sum}</div>;
    }
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        sum: defineEntry({ component: Panel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, S>()({
      id: "deriv",
      version: "1.0.0",
      initialState: () => ({ a: 1, b: 2 }),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "panels", entry: "sum" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("deriv", undefined);
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <CompositionsProvider runtime={runtime}>
          <CompositionOutlet compositionId="deriv" instanceId={id}>
            {(zones) => <div>{zones.body}</div>}
          </CompositionOutlet>
        </CompositionsProvider>,
      );
      expect(screen.getByTestId("slice").textContent).toBe("3");
      // No tearing warning logged. React 19's check fires through
      // `console.error`; presence of any such message would indicate a
      // regression.
      const messages = warn.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => /getSnapshot/i.test(m))).toBe(false);

      // Dispatch that *doesn't* change the read slices — the panel
      // still renders the same sum and the cached object identity is
      // preserved (otherwise React would log the tearing warning here
      // too).
      act(() => {
        runtime.dispatch<S>(id, { a: 1, b: 2 });
      });
      expect(screen.getByTestId("slice").textContent).toBe("3");

      // Dispatch that *does* change the read slices — the panel
      // re-renders with the new sum.
      act(() => {
        runtime.dispatch<S>(id, { a: 10, b: 5 });
      });
      expect(screen.getByTestId("slice").textContent).toBe("15");
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// ZoneRenderer — null state still drives the selector
// ---------------------------------------------------------------------------

describe("null state drives the selector", () => {
  it("invokes the zone selector when composition state is legitimately null", () => {
    // `getStateSnapshot` uses a `STATE_UNAVAILABLE` symbol sentinel
    // for the mid-disposal "no store" condition, not `null`, so a
    // composition whose state is `null` still flows through the
    // selector instead of silently falling to `{ kind: "empty" }`.
    function Marker() {
      return <div data-testid="rendered-because-state-was-null">ok</div>;
    }
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        marker: defineEntry({ component: Marker as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, null>()({
      id: "null-state",
      version: "1.0.0",
      initialState: () => null,
      zones: {
        body: {
          select: ({ state }) => {
            // The selector must observe `state === null` (not the
            // unavailable sentinel). If the gate confused null with
            // unavailable, this selector wouldn't run and the zone
            // would render empty.
            if (state === null) {
              return { kind: "module-entry", module: "panels", entry: "marker" } as const;
            }
            return { kind: "empty" } as const;
          },
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("null-state", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="null-state" instanceId={id}>
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("rendered-because-state-was-null")).toBeTruthy();
  });
});
