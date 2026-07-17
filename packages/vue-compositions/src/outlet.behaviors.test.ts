/**
 * Outlet-level behavior coverage: contextValue identity stability, retry-counter
 * reset on resolution change, the `ignore` error policy, and journey-zone
 * instance caching. Ported from the React `outlet.behaviors.test.tsx`; the
 * React-only StrictMode-survival case is omitted (Vue's `setup` runs once, so
 * there is no simulated mount/unmount/mount dance to defend against).
 */

import { defineComponent, h, inject, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import type { RuntimeMountAdapter } from "@modular-frontend/core";

import { createCompositionRuntime, defineComposition } from "@modular-frontend/compositions-engine";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import { compositionInstanceKey, useCompositionState } from "./hooks.js";
import type { CompositionContextValue } from "./hooks.js";

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

interface PanelState {
  readonly tick: number;
  readonly throwOn: number | null;
  readonly errorPolicy: "fallback" | "ignore" | "retry";
}

// A panel that publishes the latest contextValue reference it observed on every
// render. Used to verify the memoization contract: identity is stable across
// composition state changes.
const seenContextValues: Array<CompositionContextValue | null> = [];
const ContextSpyPanel = defineComponent({
  name: "ContextSpyPanel",
  props: {
    input: { type: null, default: undefined },
    exit: { type: Function, default: undefined },
  },
  setup() {
    const ctx = inject(compositionInstanceKey, null);
    const tick = useCompositionState<PanelState, number>((s) => s.tick);
    return () => {
      seenContextValues.push(ctx);
      return h("div", { "data-testid": "ctx-spy" }, `spy ${tick.value}`);
    };
  },
});

const ThrowOnTickPanel = defineComponent({
  name: "ThrowOnTickPanel",
  props: {
    input: { type: null, default: undefined },
    exit: { type: Function, default: undefined },
  },
  setup() {
    const tick = useCompositionState<PanelState, number>((s) => s.tick);
    const throwOn = useCompositionState<PanelState, number | null>((s) => s.throwOn);
    return () => {
      if (throwOn.value !== null && tick.value === throwOn.value) {
        throw new Error(`boom at ${tick.value}`);
      }
      return h("div", { "data-testid": "throw-on-tick" }, `tick=${tick.value}`);
    };
  },
});

const panelsModule = defineModule({
  id: "panels",
  version: "1.0.0",
  exitPoints: { done: defineExit() },
  entryPoints: {
    ctxSpy: defineEntry({ component: ContextSpyPanel as never, input: schema<void>() }),
    throwOnTick: defineEntry({ component: ThrowOnTickPanel as never, input: schema<void>() }),
  },
});

type Modules = { readonly panels: typeof panelsModule };

const composition = defineComposition<Modules, PanelState>()({
  id: "panels",
  version: "1.0.0",
  initialState: () => ({ tick: 0, throwOn: null, errorPolicy: "fallback" as const }),
  zones: {
    a: { select: () => ({ kind: "module-entry", module: "panels", entry: "ctxSpy" }) },
    b: {
      select: () => ({
        kind: "module-entry",
        module: "panels",
        entry: "throwOnTick",
        input: undefined,
      }),
    },
  },
  onZoneError: (_err, ctx) => (ctx.state as PanelState).errorPolicy,
});

function makeRuntime() {
  return createCompositionRuntime(
    [{ definition: composition, options: undefined } as RegisteredComposition],
    { modules: { panels: panelsModule }, debug: false },
  );
}

describe("contextValue stability", () => {
  it("keeps contextValue identity stable across composition state changes", async () => {
    const runtime = makeRuntime();
    const id = runtime.start("panels", undefined);
    seenContextValues.length = 0;
    mountViaProvider(runtime, { compositionId: "panels", instanceId: id }, (zones) =>
      h("div", [zones.a]),
    );
    const initialValue = seenContextValues[seenContextValues.length - 1];
    expect(initialValue).not.toBeNull();
    // 5 dispatches that mutate state. The panel re-renders each time (it reads
    // state via useCompositionState), but the contextValue identity must NOT
    // change — the contract foreign panels rely on.
    for (let i = 1; i <= 5; i++) {
      runtime.dispatch<PanelState>(id, { tick: i });
      await nextTick();
    }
    for (const seen of seenContextValues) {
      expect(seen).toBe(initialValue);
    }
  });
});

describe("retry counter reset on resolution change", () => {
  it("recovers from an exhausted retry budget when the resolution changes", async () => {
    type State = { readonly mode: "broken" | "ok" };
    const BrokenPanel = defineComponent({
      name: "BrokenPanel",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        return () => {
          throw new Error("always-bad");
        };
      },
    });
    const OkPanel = defineComponent({
      name: "OkPanel",
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "switch", instanceId: id, retryLimit: 1 },
      (zones) => h("div", [zones.body]),
    );
    await flushPromises();
    // The broken panel exhausts the retry budget (default fallback rendered).
    // Switch the resolution → boundary remounts, retry counter resets, ok
    // renders.
    runtime.dispatch<State>(id, { mode: "ok" });
    await flushPromises();
    expect(wrapper.find('[data-testid="ok"]').exists()).toBe(true);
  });
});

describe("onZoneError = 'ignore' renders null", () => {
  it("suppresses the error UI when the policy returns 'ignore'", async () => {
    const runtime = makeRuntime();
    const id = runtime.start("panels", undefined);
    runtime.dispatch<PanelState>(id, { errorPolicy: "ignore", throwOn: 5, tick: 5 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "panels", instanceId: id },
      (zones) => h("div", { "data-testid": "root" }, [zones.b]),
    );
    await flushPromises();
    // No error chrome rendered; root is empty.
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="root"]').text()).toBe("");
  });
});

describe("journey-zone instance caching", () => {
  it("does not mint a new journey instance on every composition state change", async () => {
    interface MockHandle {
      readonly id: string;
    }
    const startSpy = vi.fn((_definitionId: string, _input: unknown) => "ji_mock");
    const fakeAdapter: RuntimeMountAdapter = {
      start: startSpy,
      Outlet: defineComponent({
        name: "FakeJourneyOutlet",
        props: {
          instanceId: { type: String, default: "" },
          loadingFallback: { type: null, default: undefined },
        },
        setup() {
          return () => h("div", { "data-testid": "journey-outlet" });
        },
      }) as never,
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
    mountViaProvider(runtime, { compositionId: "j-zone", instanceId: id }, (zones) =>
      h("div", [zones.only]),
    );
    const baselineCalls = startSpy.mock.calls.length;
    expect(baselineCalls).toBeGreaterThanOrEqual(1);
    // The selector returns the same handle+input every time, so further
    // dispatches should not grow the start() count.
    for (let i = 1; i <= 5; i++) {
      runtime.dispatch<State>(id, { tick: i });
      await nextTick();
    }
    expect(startSpy.mock.calls.length).toBe(baselineCalls);
  });
});
