import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import { createCompositionRuntime, defineComposition } from "@modular-frontend/compositions-engine";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";
import { CompositionsProvider } from "./provider.js";
import { useComposition, useCompositionOptions } from "./use-composition.js";

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const def = defineComposition<{}, { tick: number }>()({
  id: "use-comp",
  version: "1.0.0",
  initialState: () => ({ tick: 0 }),
  zones: { only: { select: () => ({ kind: "empty" }) as const } },
});

function makeRuntime() {
  return createCompositionRuntime(
    [{ definition: def, options: undefined } as RegisteredComposition],
    { modules: {}, debug: false },
  );
}

describe("useComposition", () => {
  it("mints an instance once per mount and exposes the id", () => {
    const runtime = makeRuntime();
    let id = "";
    const Host = defineComponent({
      setup() {
        id = useComposition("use-comp", undefined);
        return () => null;
      },
    });
    const Root = defineComponent({
      setup() {
        return () => h(CompositionsProvider, { runtime }, () => h(Host));
      },
    });
    mount(Root);

    expect(id).toMatch(/^ci_/);
    expect(runtime.getInstance(id)).not.toBeNull();
  });

  it("disposes the instance on unmount via the subscription refcount", async () => {
    const runtime = makeRuntime();
    let id = "";
    const Host = defineComponent({
      setup() {
        id = useComposition("use-comp", undefined);
        return () => null;
      },
    });
    const Root = defineComponent({
      setup() {
        return () => h(CompositionsProvider, { runtime }, () => h(Host));
      },
    });
    const wrapper = mount(Root);

    expect(runtime.getInstance(id)).not.toBeNull();
    wrapper.unmount();
    await flushMicrotasks();
    // No outlet ever attached; the no-op subscription's teardown drove the
    // runtime's disposal gate.
    expect(runtime.getInstance(id)).toBeNull();
  });

  it("does not re-mint across parent re-renders (bound at mount)", async () => {
    const runtime = makeRuntime();
    const startSpy = vi.spyOn(runtime, "start");
    let id = "";
    const Host = defineComponent({
      setup() {
        id = useComposition("use-comp", undefined);
        return () => null;
      },
    });
    const Root = defineComponent({
      props: { tick: { type: Number, required: true } },
      setup(props) {
        return () => h(CompositionsProvider, { runtime }, () => [h("span", props.tick), h(Host)]);
      },
    });
    const wrapper = mount(Root, { props: { tick: 0 } });
    const first = id;
    await wrapper.setProps({ tick: 1 });

    expect(id).toBe(first);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves the runtime from useCompositionOptions when no provider is mounted", () => {
    const runtime = makeRuntime();
    let id = "";
    const Host = defineComponent({
      setup() {
        id = useComposition("use-comp", undefined, useCompositionOptions({ runtime }));
        return () => null;
      },
    });
    mount(Host);

    expect(id).toMatch(/^ci_/);
    expect(runtime.getInstance(id)).not.toBeNull();
  });

  it("treats an input shaped like options as input, not options (brand disambiguation)", () => {
    // The whole reason `useCompositionOptions` brands the options object: an
    // `input` of shape `{ runtime: … }` is a perfectly valid TInput and must
    // not be sniffed as options. Without the brand, the decoy runtime on the
    // input would hijack minting; with it, the runtime still comes from context
    // and the object flows through as input.
    const runtime = makeRuntime();
    const decoy = makeRuntime();
    const ctxStart = vi.spyOn(runtime, "start");
    const decoyStart = vi.spyOn(decoy, "start");

    let id = "";
    const Host = defineComponent({
      setup() {
        id = useComposition("use-comp", { runtime: decoy });
        return () => null;
      },
    });
    const Root = defineComponent({
      setup() {
        return () => h(CompositionsProvider, { runtime }, () => h(Host));
      },
    });
    mount(Root);

    expect(ctxStart).toHaveBeenCalledTimes(1);
    expect(ctxStart).toHaveBeenCalledWith("use-comp", { runtime: decoy });
    expect(decoyStart).not.toHaveBeenCalled();
    expect(runtime.getInstance(id)).not.toBeNull();
  });

  it("detects branded options while still forwarding the middle argument as input", () => {
    // No provider mounted, so the branded options is the only runtime source;
    // the preceding argument must still be forwarded to `runtime.start` as
    // input rather than being swallowed by the options detection.
    const runtime = makeRuntime();
    const start = vi.spyOn(runtime, "start");

    let id = "";
    const Host = defineComponent({
      setup() {
        id = useComposition("use-comp", { payload: 1 }, useCompositionOptions({ runtime }));
        return () => null;
      },
    });
    mount(Host);

    expect(start).toHaveBeenCalledWith("use-comp", { payload: 1 });
    expect(runtime.getInstance(id)).not.toBeNull();
  });

  it("throws a clear error when used without a runtime / provider", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Host = defineComponent({
      setup() {
        useComposition("use-comp", undefined);
        return () => null;
      },
    });
    try {
      expect(() => mount(Host)).toThrow(/needs a runtime/);
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
