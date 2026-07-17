/**
 * Outlet-dependent rendering coverage ported from the React
 * `runtime.disposal-and-validation.test.tsx` and `runtime.lifecycle-followups.test.tsx`.
 * The framework-neutral engine cases from those files — the `subscribe`
 * disposal gate, the `dispatch`-during-disposal guard, listener-throw routing
 * through `options.onError`, and `hydrateComposition` release idempotency — are
 * engine behaviors covered by `@modular-frontend/compositions-engine`'s own
 * suite and are not re-tested through the Vue outlet here.
 */

import { defineComponent, h, nextTick, type PropType } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineModule, schema } from "@modular-frontend/core";

import {
  createCompositionRuntime,
  defineComposition,
  hydrateComposition,
} from "@modular-frontend/compositions-engine";
import type {
  CompositionInstanceId,
  RegisteredComposition,
  SerializedComposition,
} from "@modular-frontend/compositions-engine";
import { CompositionOutlet, __resetNoopExitWarned } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import { useCompositionState } from "./hooks.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

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
// Selector throws on one render, recovers on the next.
// ---------------------------------------------------------------------------

describe("zone renderer stability across selector throws", () => {
  it("does not crash when a selector throws on one render and recovers on the next", async () => {
    type State = { readonly flaky: boolean };
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
      entryPoints: { main: defineEntry({ component: Ok as never, input: schema<void>() }) },
    });
    type Modules = { readonly panels: typeof mod };
    const def = defineComposition<Modules, State>()({
      id: "flaky",
      version: "1.0.0",
      initialState: () => ({ flaky: true }),
      zones: {
        body: {
          select: ({ state }) => {
            if (state.flaky) throw new Error("selector boom");
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
    let wrapper: ReturnType<typeof mountViaProvider>;
    expect(() => {
      wrapper = mountViaProvider(runtime, { compositionId: "flaky", instanceId: id }, (zones) =>
        h("div", { "data-testid": "root" }, [zones.body]),
      );
    }).not.toThrow();
    expect(wrapper!.find('[data-testid="ok"]').exists()).toBe(false);
    runtime.dispatch<State>(id, { flaky: false });
    await nextTick();
    expect(wrapper!.find('[data-testid="ok"]').exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// notFoundComponent
// ---------------------------------------------------------------------------

describe("notFoundComponent", () => {
  it("renders the host-supplied not-found component when a module-entry is missing", () => {
    const def = defineComposition<{}, {}>()({
      id: "nf",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "ghost", entry: "missing" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: {}, debug: false },
    );
    const id = runtime.start("nf", undefined);
    const NotFound = defineComponent({
      name: "CustomNotFound",
      props: {
        zone: { type: String, required: true },
        moduleId: { type: String, required: true },
        entry: { type: String, required: true },
      },
      setup(props) {
        return () =>
          h("div", { "data-testid": "custom-nf" }, `missing ${props.moduleId}.${props.entry}`);
      },
    });
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "nf", instanceId: id, notFoundComponent: NotFound },
      (zones) => h("div", [zones.body]),
    );
    expect(wrapper.get('[data-testid="custom-nf"]').text()).toBe("missing ghost.missing");
  });
});

// ---------------------------------------------------------------------------
// Journey-kind resolution without a registered "journey" mount adapter.
// ---------------------------------------------------------------------------

describe("journey-kind resolution without a registered adapter", () => {
  it("renders the host's errorComponent when no journey mount adapter is registered", () => {
    const def = defineComposition<{}, {}>()({
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
    const ErrorView = defineComponent({
      name: "ErrorView",
      props: {
        zone: { type: String, default: "" },
        error: { type: null as unknown as PropType<unknown>, default: undefined },
      },
      setup(props) {
        return () => h("div", { "data-testid": "zone-err" }, (props.error as Error).message);
      },
    });
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "no-adapter", instanceId: id, errorComponent: ErrorView },
      (zones) => h("div", [zones.only]),
    );
    expect(wrapper.get('[data-testid="zone-err"]').text()).toMatch(
      /no mount adapter is registered for kind "journey"/,
    );
  });
});

// ---------------------------------------------------------------------------
// Two outlets on the same instanceId.
// ---------------------------------------------------------------------------

describe("two outlets on the same instanceId", () => {
  it("renders both, propagates dispatches to both, and disposes after both unmount", async () => {
    interface State {
      readonly tick: number;
    }
    const Counter = defineComponent({
      name: "Counter",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        const tick = useCompositionState<State, number>((s) => s.tick);
        return () => h("span", { class: "counter" }, String(tick.value));
      },
    });
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: { counter: defineEntry({ component: Counter as never, input: schema<void>() }) },
    });
    type Modules = { readonly panels: typeof mod };
    const def = defineComposition<Modules, State>()({
      id: "twins",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        only: { select: () => ({ kind: "module-entry", module: "panels", entry: "counter" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("twins", undefined);
    const wrapper = mount(CompositionsProvider, {
      props: { runtime },
      slots: {
        default: () => [
          h(
            CompositionOutlet,
            { compositionId: "twins", instanceId: id },
            {
              default: (zones: Record<string, unknown>) =>
                h("div", { "data-testid": "first" }, [zones.only]),
            },
          ),
          h(
            CompositionOutlet,
            { compositionId: "twins", instanceId: id },
            {
              default: (zones: Record<string, unknown>) =>
                h("div", { "data-testid": "second" }, [zones.only]),
            },
          ),
        ],
      },
    });
    expect(wrapper.get('[data-testid="first"]').text()).toBe("0");
    expect(wrapper.get('[data-testid="second"]').text()).toBe("0");
    runtime.dispatch<State>(id, { tick: 7 });
    await nextTick();
    expect(wrapper.get('[data-testid="first"]').text()).toBe("7");
    expect(wrapper.get('[data-testid="second"]').text()).toBe("7");
    wrapper.unmount();
    await flushMicrotasks();
    expect(runtime.getInstance(id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No journey adapter required for non-journey zones.
// ---------------------------------------------------------------------------

describe("no journey adapter required for non-journey zones", () => {
  it("renders normally when zones don't return journey resolutions", () => {
    const def = defineComposition<{}, {}>()({
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
    let wrapper: ReturnType<typeof mountViaProvider>;
    expect(() => {
      wrapper = mountViaProvider(runtime, { compositionId: "plain", instanceId: id }, (zones) =>
        h("div", { "data-testid": "root" }, [zones.only]),
      );
    }).not.toThrow();
    expect(wrapper!.find('[data-testid="root"]').exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cycle detection — an instance refuses to mount itself as a descendant.
// ---------------------------------------------------------------------------

describe("composition cycle detection", () => {
  it("renders the error fallback instead of stack-overflowing when an instance mounts itself", () => {
    let cycleInstanceId = "";
    let cycleRuntime: ReturnType<typeof createCompositionRuntime> | null = null;

    // The panel renders a nested CompositionOutlet for THE SAME composition
    // instance — the shape a journey-of-composition cycle produces.
    const RecursePanel = defineComponent({
      name: "RecursePanel",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        return () =>
          h(
            CompositionOutlet,
            { runtime: cycleRuntime as never, compositionId: "cycle", instanceId: cycleInstanceId },
            {
              default: (zones: Record<string, unknown>) =>
                h("div", { "data-testid": "inner" }, [zones.body]),
            },
          );
      },
    });
    const selfModule = defineModule({
      id: "self",
      version: "1.0.0",
      entryPoints: {
        recurse: defineEntry({ component: RecursePanel as never, input: schema<void>() }),
      },
    });
    type Modules = { readonly self: typeof selfModule };
    const def = defineComposition<Modules, {}>()({
      id: "cycle",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "self", entry: "recurse" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { self: selfModule }, debug: false },
    );
    cycleRuntime = runtime;
    cycleInstanceId = runtime.start("cycle", undefined);

    let wrapper: ReturnType<typeof mountViaProvider>;
    expect(() => {
      wrapper = mountViaProvider(
        runtime,
        { compositionId: "cycle", instanceId: cycleInstanceId },
        (zones) => h("div", { "data-testid": "outer" }, [zones.body]),
      );
    }).not.toThrow();
    expect(wrapper!.find('[data-testid="outer"]').exists()).toBe(true);
    const alert = wrapper!.get('[role="alert"]');
    expect(alert.text()).toMatch(/already in the render ancestry/);
  });
});

// ---------------------------------------------------------------------------
// Definition-depth cycle cap — cross-instance recursion through the same def.
// ---------------------------------------------------------------------------

describe("definition-depth cycle cap", () => {
  it("renders the error fallback once the same definition nests beyond the depth cap", () => {
    let runtimeRef: ReturnType<typeof createCompositionRuntime>;
    // Each render of the recurse panel mounts a NEW outlet for a fresh instance
    // of the same composition definition — distinct instance ids per hop, so the
    // same-instance guard misses it and the depth counter catches it at >= 8.
    const RecursePanel = defineComponent({
      name: "DepthRecursePanel",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        const id = runtimeRef.start("depth-cycle", { id: Math.random().toString(36).slice(2, 8) });
        return () =>
          h(
            CompositionOutlet,
            { runtime: runtimeRef as never, compositionId: "depth-cycle", instanceId: id },
            { default: (zones: Record<string, unknown>) => h("div", [zones.body]) },
          );
      },
    });
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        recurse: defineEntry({ component: RecursePanel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, { id: string }>()({
      id: "depth-cycle",
      version: "1.0.0",
      initialState: (input: { id: string }) => ({ id: input.id }),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "panels", entry: "recurse" }) },
      },
    });
    runtimeRef = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const rootId = runtimeRef.start("depth-cycle", { id: "root" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    let wrapper: ReturnType<typeof mountViaProvider>;
    expect(() => {
      wrapper = mountViaProvider(
        runtimeRef,
        { compositionId: "depth-cycle", instanceId: rootId },
        (zones) => h("div", { "data-testid": "root" }, [zones.body]),
      );
    }).not.toThrow();
    const alerts = wrapper!.findAll('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const messages = alerts.map((a) => a.text()).join("\n");
    expect(messages).toMatch(/nested inside itself/);
    expect(messages).toMatch(/depth-cycle/);
  });
});

// ---------------------------------------------------------------------------
// NOOP_EXIT dev-warn — panels that try to call exit get a clear message.
// ---------------------------------------------------------------------------

describe("NOOP_EXIT dev-warn", () => {
  it("warns once per exit name when a composition panel calls exit()", async () => {
    // Mimic a journey-shaped panel reused inside a composition zone. It reads a
    // reactive slice so a dispatch re-renders it, and calls `exit` from the
    // render function — the Vue analog of React calling it on every render.
    const ExitCallingPanel = defineComponent({
      name: "ExitCallingPanel",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup(props) {
        const tick = useCompositionState<{ tick: number }, number>((s) => s.tick);
        return () => {
          void tick.value;
          (props.exit as (name: string) => void)?.("done");
          return h("div", { "data-testid": "exit-call" }, "called exit");
        };
      },
    });
    const mod = defineModule({
      id: "panels",
      version: "1.0.0",
      entryPoints: {
        main: defineEntry({ component: ExitCallingPanel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly panels: typeof mod };
    const def = defineComposition<Mods, { tick: number }>()({
      id: "noop-exit",
      version: "1.0.0",
      initialState: () => ({ tick: 0 }),
      zones: {
        body: { select: () => ({ kind: "module-entry", module: "panels", entry: "main" }) },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { panels: mod }, debug: false },
    );
    const id = runtime.start("noop-exit", undefined);
    __resetNoopExitWarned();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "noop-exit", instanceId: id },
      (zones) => h("div", [zones.body]),
    );
    // The panel renders despite calling exit — exit is a no-op.
    expect(wrapper.get('[data-testid="exit-call"]').exists()).toBe(true);
    expect(warn).toHaveBeenCalled();
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('"done"'))).toBe(true);
    expect(messages.some((m) => m.includes("useCompositionDispatch"))).toBe(true);

    // Re-render: same exit name → warn does NOT fire again (once-per-name latch).
    warn.mockClear();
    runtime.dispatch<{ tick: number }>(id, { tick: 1 });
    await nextTick();
    const reMessages = warn.mock.calls.map((c) => String(c[0]));
    expect(reMessages.some((m) => m.includes('"done"'))).toBe(false);

    // `__resetNoopExitWarned()` clears the latch so a subsequent exit call for
    // the same name re-fires the warn (test-isolation escape hatch).
    warn.mockClear();
    __resetNoopExitWarned();
    runtime.dispatch<{ tick: number }>(id, { tick: 2 });
    await nextTick();
    const postResetMessages = warn.mock.calls.map((c) => String(c[0]));
    expect(postResetMessages.some((m) => m.includes('"done"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hydrateComposition hold survives outlet remounts.
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

    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "hold", instanceId: handle.instanceId },
      (zones) => h("div", { "data-testid": "root" }, [zones.only]),
    );
    wrapper.unmount();
    await flushMicrotasks();
    expect(runtime.getInstance(handle.instanceId)).not.toBeNull();
    expect(runtime.getInstance(handle.instanceId)?.state).toEqual({ docId: "ssr-seed" });

    // Release — disposal gate kicks in and the instance goes away.
    handle.release();
    await flushMicrotasks();
    expect(runtime.getInstance(handle.instanceId)).toBeNull();
  });
});
