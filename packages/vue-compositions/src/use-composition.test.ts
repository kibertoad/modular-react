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
