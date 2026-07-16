import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { createCompositionRuntime, defineComposition } from "@modular-frontend/compositions-engine";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";
import { CompositionsProvider, useCompositionsContext } from "./provider.js";
import type { CompositionProviderValue } from "./provider.js";

const trivial = defineComposition<{}, { tick: number }>()({
  id: "prov-trivial",
  version: "1.0.0",
  initialState: () => ({ tick: 0 }),
  zones: { only: { select: () => ({ kind: "empty" }) as const } },
});

function makeRuntime() {
  return createCompositionRuntime(
    [{ definition: trivial, options: undefined } as RegisteredComposition],
    { modules: {}, debug: false },
  );
}

describe("CompositionsProvider", () => {
  it("exposes the runtime to descendants through context without threading props", () => {
    const runtime = makeRuntime();

    let seen: CompositionProviderValue | null = null;
    const Probe = defineComponent({
      setup() {
        seen = useCompositionsContext();
        return () => null;
      },
    });

    // Render the provider through `h()` (as a real app / the plugin does) rather
    // than as the mounted root — vue-test-utils holds a root's props in a deep
    // `reactive()`, which would proxy the runtime and defeat the identity check.
    const Root = defineComponent({
      setup() {
        return () => h(CompositionsProvider, { runtime }, () => h(Probe));
      },
    });
    mount(Root);

    expect(seen).not.toBeNull();
    expect(seen!.runtime).toBe(runtime);
  });

  it("useCompositionsContext returns null when no CompositionsProvider is mounted", () => {
    let seen: CompositionProviderValue | null | undefined = undefined;
    const Probe = defineComponent({
      setup() {
        seen = useCompositionsContext();
        return () => null;
      },
    });
    mount(Probe);
    expect(seen).toBeNull();
  });

  it("preserves the provider value reference across parent re-renders (no fanout)", async () => {
    const runtime = makeRuntime();
    const seen: Array<CompositionProviderValue | null> = [];
    const Probe = defineComponent({
      setup() {
        seen.push(useCompositionsContext());
        return () => null;
      },
    });
    const Root = defineComponent({
      props: { tick: { type: Number, required: true } },
      setup(props) {
        // The tick prop churns the parent render; the provided value is captured
        // once at CompositionsProvider setup, so descendants never see a new
        // context object — the Vue analog of the React memo-on-runtime guarantee.
        return () => h(CompositionsProvider, { runtime }, () => [h("span", props.tick), h(Probe)]);
      },
    });
    const wrapper = mount(Root, { props: { tick: 0 } });
    await wrapper.setProps({ tick: 1 });

    expect(seen.length).toBeGreaterThanOrEqual(1);
    const first = seen[0];
    for (const v of seen) expect(v).toBe(first);
    expect(first!.runtime).toBe(runtime);
  });
});
