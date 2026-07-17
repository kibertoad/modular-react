import { defineComponent, h, provide, type ShallowRef } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "@modular-frontend/core";
import type {
  CompositionRuntime,
  CompositionZoneEvent,
} from "@modular-frontend/compositions-engine";

import {
  compositionInstanceKey,
  createCompositionContext,
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionState,
  useCompositionZone,
} from "./hooks.js";
import type { CompositionContextValue } from "./hooks.js";

interface CounterState {
  readonly count: number;
  readonly label: string;
}

/**
 * Fabricate the per-mount context the outlet (PR-34) installs above a zone
 * panel, backed by a real core store. `dispatch` shallow-merges through the
 * store (as the runtime's dispatch does), so a panel-invoked callback flows
 * back into the `useCompositionState` ref. `runtime` is only carried for
 * identity — the panel composables don't touch it.
 */
function makeContext(initial: CounterState) {
  const store = createStore<CounterState>(initial);
  const emit = vi.fn<(event: CompositionZoneEvent) => void>();
  const dispatch = (
    updater: Partial<CounterState> | ((prev: CounterState) => Partial<CounterState> | CounterState),
  ): void => {
    store.setState(updater as never);
  };
  const ctx: CompositionContextValue = {
    runtime: {} as CompositionRuntime,
    compositionId: "counter-composition",
    instanceId: "ci_test" as never,
    zone: "main",
    store,
    dispatch: dispatch as never,
    emit,
  };
  return { ctx, store, emit };
}

/** Mount `Panel` under a component that provides `ctx` on `compositionInstanceKey`. */
function mountPanel(ctx: CompositionContextValue, Panel: ReturnType<typeof defineComponent>) {
  const Host = defineComponent({
    setup() {
      provide(compositionInstanceKey, ctx);
      return () => h(Panel);
    },
  });
  return mount(Host);
}

describe("useCompositionState", () => {
  it("reads the scoped state reactively and re-publishes on dispatch", async () => {
    const { ctx } = makeContext({ count: 0, label: "a" });
    let count!: ShallowRef<number>;
    const Panel = defineComponent({
      setup() {
        count = useCompositionState<CounterState, number>((s) => s.count);
        const dispatch = useCompositionDispatch<CounterState>();
        return () =>
          h("button", { onClick: () => dispatch((prev) => ({ count: prev.count + 1 })) }, "+");
      },
    });
    const wrapper = mountPanel(ctx, Panel);

    expect(count.value).toBe(0);
    await wrapper.get("button").trigger("click");
    expect(count.value).toBe(1);
    await wrapper.get("button").trigger("click");
    await wrapper.get("button").trigger("click");
    expect(count.value).toBe(3);
  });

  it("selector equality short-circuits an unrelated state update", async () => {
    const { ctx, store } = makeContext({ count: 0, label: "a" });
    const observed: number[] = [];
    let count!: ShallowRef<number>;
    const Panel = defineComponent({
      setup() {
        count = useCompositionState<CounterState, number>((s) => s.count);
        return () => {
          observed.push(count.value);
          return h("span", count.value);
        };
      },
    });
    mountPanel(ctx, Panel);
    observed.length = 0;

    // Change only `label` — the `count` selection is unchanged, so the
    // `shallowRef` dedupes and the panel does not re-render.
    store.setState({ label: "b" });
    await Promise.resolve();
    expect(observed).toEqual([]);
    expect(count.value).toBe(0);

    // Change `count` — the selection updates and the panel re-renders.
    store.setState({ count: 5 });
    await Promise.resolve();
    expect(count.value).toBe(5);
  });

  it("full-state form (no selector) tracks the whole state object", async () => {
    const { ctx, store } = makeContext({ count: 1, label: "x" });
    let state!: ShallowRef<CounterState>;
    const Panel = defineComponent({
      setup() {
        state = useCompositionState<CounterState>();
        return () => null;
      },
    });
    mountPanel(ctx, Panel);

    expect(state.value).toEqual({ count: 1, label: "x" });
    store.setState({ count: 2 });
    await Promise.resolve();
    expect(state.value).toEqual({ count: 2, label: "x" });
  });

  it("does not tear when the selector returns a fresh object each call", async () => {
    // The React binding needs bespoke state-keyed caching to keep this from
    // tripping the "getSnapshot should be cached" warning (React calls the
    // selector on every render). Vue's setup runs once and the store push is
    // event-driven, so a fresh-object selection simply re-publishes when the
    // underlying state actually changes — no warning path exists.
    const { ctx, store } = makeContext({ count: 1, label: "y" });
    let slice!: ShallowRef<{ readonly sum: number }>;
    const Panel = defineComponent({
      setup() {
        slice = useCompositionState<CounterState & { a: number; b: number }, { sum: number }>(
          (s) => ({ sum: (s as { a?: number }).a ?? s.count }),
        );
        return () => null;
      },
    });
    mountPanel(ctx, Panel);

    expect(slice.value).toEqual({ sum: 1 });
    store.setState({ count: 10 });
    await Promise.resolve();
    expect(slice.value).toEqual({ sum: 10 });
  });
});

describe("useCompositionDispatch", () => {
  it("returns a stable dispatch reference across accesses in a single mount", () => {
    const { ctx } = makeContext({ count: 0, label: "a" });
    const sightings: Array<(u: unknown) => void> = [];
    const Panel = defineComponent({
      setup() {
        sightings.push(useCompositionDispatch<CounterState>() as (u: unknown) => void);
        sightings.push(useCompositionDispatch<CounterState>() as (u: unknown) => void);
        return () => null;
      },
    });
    mountPanel(ctx, Panel);

    expect(sightings.length).toBe(2);
    expect(sightings[0]).toBe(sightings[1]);
    expect(sightings[0]).toBe(ctx.dispatch);
  });
});

describe("useCompositionEmit", () => {
  it("routes zone events to the context emit callback", async () => {
    const { ctx, emit } = makeContext({ count: 0, label: "a" });
    const Panel = defineComponent({
      setup() {
        const fire = useCompositionEmit();
        return () => h("button", { onClick: () => fire({ kind: "open-modal", payload: 1 }) }, "go");
      },
    });
    const wrapper = mountPanel(ctx, Panel);

    await wrapper.get("button").trigger("click");
    expect(emit).toHaveBeenCalledWith({ kind: "open-modal", payload: 1 });
  });
});

describe("useCompositionZone", () => {
  it("exposes compositionId, instanceId, and the active zone", () => {
    const { ctx } = makeContext({ count: 0, label: "a" });
    let zone: ReturnType<typeof useCompositionZone> | undefined;
    const Panel = defineComponent({
      setup() {
        zone = useCompositionZone();
        return () => null;
      },
    });
    mountPanel(ctx, Panel);

    expect(zone).toEqual({
      compositionId: "counter-composition",
      instanceId: "ci_test",
      zone: "main",
    });
  });
});

describe("panel composables require a zone context", () => {
  it("throw a clear error when used outside a <CompositionOutlet> zone panel", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Panel = defineComponent({
      setup() {
        useCompositionState<CounterState>();
        return () => null;
      },
    });
    try {
      expect(() => mount(Panel)).toThrow(/inside a <CompositionOutlet> zone panel/);
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

describe("createCompositionContext", () => {
  it("builds a pre-typed bundle that threads through the same context", async () => {
    const { ctx } = makeContext({ count: 2, label: "z" });
    const { useState, useDispatch, useEmit, useZone } = createCompositionContext<CounterState>();
    let count!: ShallowRef<number>;
    let zone: ReturnType<typeof useZone> | undefined;
    const Panel = defineComponent({
      setup() {
        count = useState((s) => s.count);
        zone = useZone();
        const dispatch = useDispatch();
        const fire = useEmit();
        return () =>
          h(
            "button",
            {
              onClick: () => {
                dispatch({ count: 9 });
                fire({ kind: "ping" });
              },
            },
            "x",
          );
      },
    });
    const wrapper = mountPanel(ctx, Panel);

    expect(count.value).toBe(2);
    expect(zone!.zone).toBe("main");
    await wrapper.get("button").trigger("click");
    expect(count.value).toBe(9);
    expect(ctx.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({ kind: "ping" });
  });
});
