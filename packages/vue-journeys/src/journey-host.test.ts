import { defineComponent, h, type PropType } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";

import {
  createJourneyRuntime,
  defineJourney,
  defineJourneyHandle,
} from "@modular-frontend/journeys-engine";
import type { InstanceId } from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import { JourneyHost, useJourneyHost } from "./journey-host.js";
import { JourneyProvider } from "./provider.js";

const exits = { next: defineExit() } as const;

function stepComponent(testid: string) {
  return defineComponent({
    name: `Step-${testid}`,
    props: {
      input: { type: null as unknown as PropType<void>, default: undefined },
      exit: { type: Function as PropType<(n: string, o?: unknown) => void>, required: true },
    },
    setup(props) {
      return () =>
        h("button", { "data-testid": testid, onClick: () => props.exit("next") }, testid);
    },
  });
}

const modA = defineModule({
  id: "a",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    show: defineEntry({
      component: stepComponent("step-a") as never,
      input: schema<void>(),
      allowBack: "preserve-state",
    }),
  },
});

const modB = defineModule({
  id: "b",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    show: defineEntry({
      component: stepComponent("step-b") as never,
      input: schema<void>(),
      allowBack: "preserve-state",
    }),
  },
});

const modules = { a: modA, b: modB };
type Modules = { readonly a: typeof modA; readonly b: typeof modB };

const journey = defineJourney<Modules, Record<string, never>, void, string>()({
  id: "two-step",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { allowBack: true, next: () => ({ complete: "done" }) } },
  },
});

const handle = defineJourneyHandle(journey);

function setup() {
  return createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules,
    debug: false,
  });
}

type Runtime = ReturnType<typeof setup>;

/**
 * Mount `inner` under a JourneyProvider. The provider is deliberately not the
 * root — a root's props go through a deep `reactive()`, which would proxy the
 * runtime and defeat the raw-identity lookups the engine does internally.
 */
function mountUnderProvider(runtime: Runtime, inner: () => ReturnType<typeof h>) {
  const Root = defineComponent({
    setup() {
      return () => h(JourneyProvider, { runtime }, () => inner());
    },
  });
  return mount(Root);
}

describe("<JourneyHost>", () => {
  it("starts the journey on mount and renders its current step", async () => {
    const runtime = setup();
    const wrapper = mountUnderProvider(runtime, () => h(JourneyHost, { handle }));
    await flushPromises();

    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);
    expect(runtime.listInstances()).toHaveLength(1);
  });

  it("advances through the outlet it renders", async () => {
    const runtime = setup();
    const wrapper = mountUnderProvider(runtime, () => h(JourneyHost, { handle }));
    await flushPromises();

    await wrapper.get('[data-testid="step-a"]').trigger("click");
    expect(wrapper.find('[data-testid="step-b"]').exists()).toBe(true);
  });

  it("hands chrome the live step index and a ready-built outlet", async () => {
    const runtime = setup();
    const wrapper = mountUnderProvider(runtime, () =>
      h(
        JourneyHost,
        { handle },
        {
          default: ({ stepIndex, outlet }: { stepIndex: number; outlet: ReturnType<typeof h> }) =>
            h("div", [h("span", { "data-testid": "progress" }, `step ${stepIndex}`), outlet]),
        },
      ),
    );
    await flushPromises();

    expect(wrapper.get('[data-testid="progress"]').text()).toBe("step 0");
    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);

    await wrapper.get('[data-testid="step-a"]').trigger("click");
    expect(wrapper.get('[data-testid="progress"]').text()).toBe("step 1");
  });

  it("ends and forgets the instance on unmount", async () => {
    const runtime = setup();
    const wrapper = mountUnderProvider(runtime, () => h(JourneyHost, { handle }));
    await flushPromises();
    const id = runtime.listInstances()[0]!;

    wrapper.unmount();
    // The teardown is deferred one microtask so it settles after the inner
    // outlet's own deferred abandon.
    await Promise.resolve();

    // `forget` drops the record outright, which is the half `<JourneyOutlet>`
    // does not do on its own.
    expect(runtime.getInstance(id)).toBeNull();
    expect(runtime.listInstances()).toHaveLength(0);
  });

  it("forwards outlet props through attrs", async () => {
    const runtime = setup();
    const onFinished = vi.fn();
    const wrapper = mountUnderProvider(runtime, () => h(JourneyHost, { handle, onFinished }));
    await flushPromises();

    await wrapper.get('[data-testid="step-a"]').trigger("click");
    await wrapper.get('[data-testid="step-b"]').trigger("click");
    await flushPromises();

    // `onFinished` is not declared on JourneyHost — it reaches the outlet via
    // the attrs spread, which is what keeps the host from re-declaring (and
    // drifting from) the outlet's prop list.
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]).toMatchObject({ status: "completed", payload: "done" });
  });

  it("throws a directed error when there is no runtime", () => {
    expect(() => mount(JourneyHost, { props: { handle } })).toThrow(/needs a runtime/);
  });

  it("takes an explicit runtime prop over the provider's", async () => {
    const contextRuntime = setup();
    const ownRuntime = setup();
    mountUnderProvider(contextRuntime, () => h(JourneyHost, { handle, runtime: ownRuntime }));
    await flushPromises();

    expect(ownRuntime.listInstances()).toHaveLength(1);
    expect(contextRuntime.listInstances()).toHaveLength(0);
  });
});

describe("useJourneyHost", () => {
  it("reports no instance at setup, then the started one after mount", async () => {
    const runtime = setup();
    const frames: (InstanceId | null)[] = [];

    const Probe = defineComponent({
      setup() {
        const { instanceId } = useJourneyHost(handle, undefined);
        return () => {
          frames.push(instanceId.value);
          return null;
        };
      },
    });
    mountUnderProvider(runtime, () => h(Probe));
    await flushPromises();

    // The journey is started from `onMounted` so the start is guaranteed to be
    // paired with an `onUnmounted` that ends it — so the first render has no
    // instance. `<JourneyHost>` renders `loadingFallback` for exactly that
    // frame.
    expect(frames[0]).toBeNull();
    expect(frames.at(-1)).not.toBeNull();
    expect(runtime.listInstances()).toEqual([frames.at(-1)]);
  });

  it("tracks the step index as the journey advances and rewinds", async () => {
    const runtime = setup();
    let latest = -1;

    const Probe = defineComponent({
      setup() {
        const { stepIndex } = useJourneyHost(handle, undefined);
        return () => {
          latest = stepIndex.value;
          return null;
        };
      },
    });
    mountUnderProvider(runtime, () => h(Probe));
    await flushPromises();
    expect(latest).toBe(0);

    const id = runtime.listInstances()[0]!;
    createTestHarness(runtime).fireExit(id, "next");
    await flushPromises();
    expect(latest).toBe(1);

    runtime.goBack(id);
    await flushPromises();
    expect(latest).toBe(0);
  });

  it("keeps the same instance when props change, rather than restarting the flow", async () => {
    const runtime = setup();
    const wrapper = mountUnderProvider(runtime, () => h(JourneyHost, { handle }));
    await flushPromises();
    const id = runtime.listInstances()[0]!;

    await wrapper.get('[data-testid="step-a"]').trigger("click");
    await wrapper.setProps({});
    await flushPromises();

    // Same instance, still on the step the user reached — a prop change must
    // never abandon a half-finished flow.
    expect(runtime.listInstances()).toEqual([id]);
    expect(wrapper.find('[data-testid="step-b"]').exists()).toBe(true);
  });

  it("pins the runtime it started on, rather than following a swapped one", async () => {
    const runtimeA = setup();
    const runtimeB = setup();
    const wrapper = mount(JourneyHost, { props: { handle, runtime: runtimeA } });
    await flushPromises();
    const id = runtimeA.listInstances()[0]!;
    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);

    // The instance lives on runtimeA and its id means nothing to runtimeB, so
    // the host stays on the runtime it started against instead of stranding
    // itself against one that has never heard of the instance.
    await wrapper.setProps({ runtime: runtimeB });
    await flushPromises();

    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);
    expect(runtimeA.getInstance(id)?.status).toBe("active");
    expect(runtimeB.listInstances()).toHaveLength(0);
  });

  it("renders loadingFallback written kebab-case, as a template passes it", async () => {
    const runtime = setup();
    // What the template compiler emits for `:loading-fallback="…"`. Vue
    // camelizes kebab keys only for *declared* props, and `loadingFallback`
    // reaches the host as a fallthrough attr — so the host has to accept both
    // spellings itself, or the pre-instance frame silently renders nothing.
    const wrapper = mountUnderProvider(runtime, () =>
      h(JourneyHost, {
        handle,
        "loading-fallback": () => h("span", { "data-testid": "fallback" }, "loading"),
      }),
    );

    expect(wrapper.find('[data-testid="fallback"]').exists()).toBe(true);

    await flushPromises();
    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);
  });
});
