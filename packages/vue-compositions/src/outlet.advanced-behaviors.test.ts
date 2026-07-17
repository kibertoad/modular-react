/**
 * Outlet-dependent regression coverage ported from the React
 * `outlet.advanced-behaviors.test.tsx`. The framework-neutral engine cases from
 * that file — direct `hashInput`, `notify` listener-iteration safety,
 * `useComposition` brand disambiguation, `hydrate` mismatch/round-trip, and
 * indexed contract validation — belong to the engine / host-composable suites
 * (`@modular-frontend/compositions-engine`, PR-33's `use-composition.test.ts`)
 * and are not re-tested through the Vue outlet here. The React-only StrictMode
 * mint case is likewise omitted (Vue's `setup` runs once).
 */

import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineModule, schema } from "@modular-frontend/core";

import { createCompositionRuntime, defineComposition } from "@modular-frontend/compositions-engine";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import { useCompositionState } from "./hooks.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mountViaProvider(
  runtime: ReturnType<typeof createCompositionRuntime>,
  outletProps: Record<string, unknown>,
  slotFn: (zones: Record<string, unknown>) => unknown,
) {
  return mount(CompositionsProvider, {
    props: { runtime },
    slots: { default: () => h(CompositionOutlet, outletProps, { default: slotFn }) },
  });
}

// ---------------------------------------------------------------------------
// A throwing journey `adapter.start` is contained in the zone, not fatal
// ---------------------------------------------------------------------------

describe("journey adapter.start throwing", () => {
  it("renders the zone error fallback instead of tearing down the outlet", async () => {
    const startSpy = vi.fn(() => {
      throw new Error("boom-from-start");
    });
    const adapter = {
      start: startSpy,
      end: () => {},
      Outlet: defineComponent({
        name: "J",
        props: {
          instanceId: { type: String, default: "" },
          loadingFallback: { type: null, default: undefined },
        },
        setup() {
          return () => h("div", { "data-testid": "j" });
        },
      }),
    };
    const def = defineComposition<{}, { readonly tick: number }>()({
      id: "start-throws",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        only: {
          select: () =>
            ({
              kind: "journey",
              handle: { id: "h" } as never,
              input: undefined,
            }) as never,
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    runtime.registerMountAdapter("journey", adapter as never);
    const id = runtime.start("start-throws", undefined);
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "start-throws", instanceId: id },
      (zones) => h("div", { "data-testid": "root" }, [zones.only]),
    );
    await flushPromises();
    // `start()` threw during render, but the outlet stayed mounted and showed
    // the zone's error fallback in place — the journey outlet never rendered.
    expect(startSpy).toHaveBeenCalledTimes(1);
    const alert = wrapper.find('[data-composition-zone-error="only"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain("boom-from-start");
    expect(wrapper.find('[data-testid="j"]').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hashInput DAG safety, exercised through the journey-zone cache
// ---------------------------------------------------------------------------

describe("hashInput DAG safety (via journey-zone cache)", () => {
  it("does NOT mark a shared (non-cyclic) subtree as <cycle>", async () => {
    type State = { readonly variant: "shared" | "duplicated" };
    const sharedSubtree = { kind: "doc", id: 7 };
    const startSpy = vi.fn(() => "ji_x");
    const adapter = {
      start: startSpy,
      end: () => {},
      Outlet: defineComponent({
        name: "J",
        props: {
          instanceId: { type: String, default: "" },
          loadingFallback: { type: null, default: undefined },
        },
        setup() {
          return () => h("div", { "data-testid": "j" });
        },
      }),
    };
    const def = defineComposition<{}, State>()({
      id: "dag-share",
      version: "1.0.0",
      initialState: () => ({ variant: "shared" as const }),
      zones: {
        only: {
          select: ({ state }) =>
            ({
              kind: "journey",
              handle: { id: "h" } as never,
              input:
                state.variant === "shared"
                  ? { a: sharedSubtree, b: sharedSubtree }
                  : { a: { kind: "doc", id: 7 }, b: { kind: "doc", id: 7 } },
            }) as never,
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    runtime.registerMountAdapter("journey", adapter as never);
    const id = runtime.start("dag-share", undefined);
    mountViaProvider(runtime, { compositionId: "dag-share", instanceId: id }, (zones) =>
      h("div", [zones.only]),
    );
    const baseline = startSpy.mock.calls.length;
    expect(baseline).toBeGreaterThanOrEqual(1);
    runtime.dispatch<State>(id, { variant: "duplicated" });
    await nextTick();
    // No roll-over — same hash, cache reused.
    expect(startSpy.mock.calls.length).toBe(baseline);
  });

  it("still detects true reference cycles without infinite-looping", () => {
    type State = { readonly tick: number };
    const startSpy = vi.fn(() => "ji_x");
    const adapter = {
      start: startSpy,
      end: () => {},
      Outlet: defineComponent({
        name: "J",
        props: {
          instanceId: { type: String, default: "" },
          loadingFallback: { type: null, default: undefined },
        },
        setup() {
          return () => h("div");
        },
      }),
    };
    const def = defineComposition<{}, State>()({
      id: "true-cycle",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        only: {
          select: ({ state }) => {
            const cyclic: Record<string, unknown> = { tick: state.tick };
            cyclic.self = cyclic;
            return { kind: "journey", handle: { id: "h" } as never, input: cyclic } as never;
          },
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    runtime.registerMountAdapter("journey", adapter as never);
    const id = runtime.start("true-cycle", undefined);
    expect(() => {
      mountViaProvider(runtime, { compositionId: "true-cycle", instanceId: id }, (zones) =>
        h("div", [zones.only]),
      );
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// retry exhaustion fires onError("retry-exhausted")
// ---------------------------------------------------------------------------

describe("retry exhaustion fires onError(phase: 'retry-exhausted')", () => {
  it("emits the distinct phase when policy='retry' but the budget is consumed", async () => {
    const Boom = defineComponent({
      name: "Boom",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        return () => {
          throw new Error("always");
        };
      },
    });
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: { boom: defineEntry({ component: Boom as never, input: schema<void>() }) },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, {}>()({
      id: "retry-exh",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "panels", entry: "boom" }) },
      },
      onZoneError: () => "retry" as const,
    });
    const onError = vi.fn();
    const runtime = createCompositionRuntime(
      [{ definition: def, options: { onError } } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("retry-exh", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "retry-exh", instanceId: id, retryLimit: 1 },
      (zones) => h("div", { "data-testid": "root" }, [zones.body]),
    );
    await flushPromises();
    // Budget = 1: first throw consumes the retry; second throw exhausts.
    const phases = onError.mock.calls.map((c) => (c[1] as { phase: string }).phase);
    expect(phases).toContain("retry-exhausted");
    // Fallback UI is what the user sees.
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 'ignore' policy is cleared when the resolution rotates
// ---------------------------------------------------------------------------

describe("'ignore' policy resets on resolution change", () => {
  it("does not suppress a later error on a different resolution", async () => {
    type State = { readonly mode: "ignored-broken" | "ok" | "fallback-broken" };
    const Broken = defineComponent({
      name: "Broken",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        return () => {
          throw new Error("boom");
        };
      },
    });
    const Ok = defineComponent({
      name: "Ok",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        return () => h("div", { "data-testid": "ok" }, "ok");
      },
    });
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        broken: defineEntry({ component: Broken as never, input: schema<void>() }),
        ok: defineEntry({ component: Ok as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, State>()({
      id: "ignore-reset",
      version: "1.0.0",
      initialState: () => ({ mode: "ignored-broken" as const }),
      zones: {
        body: {
          select: ({ state }) => ({
            kind: "module-entry",
            module: "panels",
            entry: state.mode === "ok" ? "ok" : "broken",
            input: undefined,
          }),
        },
      },
      onZoneError: (_err, ctx) =>
        (ctx.state as State).mode === "ignored-broken" ? "ignore" : "fallback",
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("ignore-reset", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "ignore-reset", instanceId: id },
      (zones) => h("div", { "data-testid": "root" }, [zones.body]),
    );
    await flushPromises();
    // Phase 1: broken + ignore → render null.
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="root"]').text()).toBe("");

    // Phase 2: rotate to "ok" → resolution change, ignored flag cleared. ok renders.
    runtime.dispatch<State>(id, { mode: "ok" });
    await flushPromises();
    expect(wrapper.find('[data-testid="ok"]').exists()).toBe(true);

    // Phase 3: rotate back to a broken state with fallback policy → the boundary
    // must show error UI, not stay null from the prior ignore decision.
    runtime.dispatch<State>(id, { mode: "fallback-broken" });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Eager-preload prep is short-circuited when no zone is eager.
// ---------------------------------------------------------------------------

describe("eager preload skipped when no zone is eager", () => {
  it("does not re-invoke the selector for non-eager zones beyond the render path", async () => {
    const selectSpy = vi.fn(() => ({ kind: "empty" }) as const);
    const def = defineComposition<{}, { tick: number }>()({
      id: "no-eager",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: { only: { select: selectSpy } },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("no-eager", undefined);
    mountViaProvider(runtime, { compositionId: "no-eager", instanceId: id }, (zones) =>
      h("div", [zones.only]),
    );
    const baseline = selectSpy.mock.calls.length;
    runtime.dispatch<{ tick: number }>(id, { tick: 1 });
    await nextTick();
    // With eager prep gated, the only additional selector calls come from the
    // zone renderer's own render path. The eager memo path adds none.
    const delta = selectSpy.mock.calls.length - baseline;
    expect(delta).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Reading composition state via the typed-state composable through the outlet.
// ---------------------------------------------------------------------------

describe("useCompositionState reads through provider context", () => {
  it("subscribes to the active instance via context", async () => {
    interface State {
      readonly tick: number;
    }
    const Probe = defineComponent({
      name: "Probe",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        const tick = useCompositionState<State, number>((s) => s.tick);
        return () => h("span", { "data-testid": "tick" }, String(tick.value));
      },
    });
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: { probe: defineEntry({ component: Probe as never, input: schema<void>() }) },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, State>()({
      id: "probe-host",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        only: { select: () => ({ kind: "module-entry", module: "panels", entry: "probe" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("probe-host", undefined);
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "probe-host", instanceId: id },
      (zones) => h("div", [zones.only]),
    );
    expect(wrapper.get('[data-testid="tick"]').text()).toBe("0");
    runtime.dispatch<State>(id, { tick: 3 });
    await nextTick();
    expect(wrapper.get('[data-testid="tick"]').text()).toBe("3");
  });
});
