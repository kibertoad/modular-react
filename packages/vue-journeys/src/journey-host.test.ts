import { defineComponent, h, ref, type Component, type PropType } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";

import {
  createJourneyRuntime,
  createMemoryPersistence,
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

/** A journey whose `onAbandon` returns a non-terminal `{ next }` — the case a
 * host's forced teardown must still terminate, or the instance leaks. */
const journeyAbandonNext = defineJourney<Modules, Record<string, never>, void, string>()({
  id: "abandon-next",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  onAbandon: () => ({ next: { module: "b", entry: "show", input: undefined } }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { allowBack: true, next: () => ({ complete: "done" }) } },
  },
});

const handleAbandonNext = defineJourneyHandle(journeyAbandonNext);

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

  it("hands chrome the live step index and a ready-built outlet component", async () => {
    const runtime = setup();
    const wrapper = mountUnderProvider(runtime, () =>
      h(
        JourneyHost,
        { handle },
        {
          // `outlet` is a functional component — render it with `h(outlet)`
          // (the render-function analog of `<component :is="outlet" />`).
          default: ({ stepIndex, outlet }: { stepIndex: number; outlet: Component }) =>
            h("div", [h("span", { "data-testid": "progress" }, `step ${stepIndex}`), h(outlet)]),
        },
      ),
    );
    await flushPromises();

    expect(wrapper.get('[data-testid="progress"]').text()).toBe("step 0");
    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);

    await wrapper.get('[data-testid="step-a"]').trigger("click");
    expect(wrapper.get('[data-testid="progress"]').text()).toBe("step 1");
    expect(wrapper.find('[data-testid="step-b"]').exists()).toBe(true);
  });

  it("renders the slot `outlet` via `<component :is>` and patches (not remounts) across steps", async () => {
    const runtime = setup();
    // A template consumer: `<component :is="outlet" />`. This is the shape the
    // docstring documents and the raw-VNode form could not satisfy.
    const Consumer = defineComponent({
      components: { JourneyHost },
      setup() {
        return { handle };
      },
      template: `
        <JourneyHost :handle="handle">
          <template #default="{ outlet, stepIndex }">
            <div>
              <span data-testid="progress">step {{ stepIndex }}</span>
              <component :is="outlet" />
            </div>
          </template>
        </JourneyHost>
      `,
    });
    const wrapper = mountUnderProvider(runtime, () => h(Consumer));
    await flushPromises();

    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);
    const id = runtime.listInstances()[0]!;

    await wrapper.get('[data-testid="step-a"]').trigger("click");
    await flushPromises();
    // Advancing patches the same outlet in place — the instance is unchanged,
    // not torn down and restarted by a remount.
    expect(wrapper.find('[data-testid="step-b"]').exists()).toBe(true);
    expect(runtime.listInstances()).toEqual([id]);
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

  it("forces a terminal teardown even when onAbandon would keep the instance alive", async () => {
    // `onAbandon` returns a non-terminal `{ next }`. Without a forced teardown,
    // unmount would advance the instance to `b` and leave it active, and
    // `forget()` — which only drops terminal records — would no-op, leaking the
    // instance and its persistence key. The host forces the teardown terminal.
    const runtime = createJourneyRuntime([{ definition: journeyAbandonNext, options: undefined }], {
      modules,
      debug: false,
    });
    const wrapper = mountUnderProvider(runtime, () =>
      h(JourneyHost, { handle: handleAbandonNext }),
    );
    await flushPromises();
    const id = runtime.listInstances()[0]!;
    expect(runtime.getInstance(id)?.status).toBe("active");

    wrapper.unmount();
    await Promise.resolve();

    expect(runtime.getInstance(id)).toBeNull();
    expect(runtime.listInstances()).toHaveLength(0);
  });

  it("does not tear down an instance a same-tick replacement host has resumed", async () => {
    // Persistence makes `start()` return the same id for the same input, so a
    // route change that swaps one host for another lands both on the same
    // instance. The outgoing host's deferred end+forget must not fire against
    // the instance the incoming host is now presenting.
    const persistence = createMemoryPersistence<void, Record<string, never>>({
      keyFor: ({ journeyId }) => journeyId,
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: { persistence } }], {
      modules,
      debug: false,
    });

    const which = ref<"a" | "b">("a");
    const Root = defineComponent({
      setup() {
        return () =>
          h(JourneyProvider, { runtime }, () =>
            which.value === "a"
              ? h(JourneyHost, { key: "a", handle })
              : h(JourneyHost, { key: "b", handle }),
          );
      },
    });
    const wrapper = mount(Root);
    await flushPromises();
    const id = runtime.listInstances()[0]!;
    expect(runtime.getInstance(id)?.status).toBe("active");

    // Different `key`: the "a" host unmounts and the "b" host mounts in the
    // same tick, and persistence hands the same instance across.
    which.value = "b";
    await flushPromises();

    expect(runtime.getInstance(id)?.status).toBe("active");
    expect(runtime.listInstances()).toEqual([id]);
    expect(wrapper.find('[data-testid="step-a"]').exists()).toBe(true);
  });

  it("tears down a shared instance only when the last concurrent host unmounts", async () => {
    // Two hosts mounted at once resolve to the same persisted instance. The
    // newer one unmounting first must not end+forget the instance the older is
    // still showing — teardown waits for the last owner.
    const persistence = createMemoryPersistence<void, Record<string, never>>({
      keyFor: ({ journeyId }) => journeyId,
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: { persistence } }], {
      modules,
      debug: false,
    });

    const hosts = ref<0 | 1 | 2>(2);
    const Root = defineComponent({
      setup() {
        return () =>
          h(JourneyProvider, { runtime }, () => [
            hosts.value >= 1 ? h(JourneyHost, { key: "a", handle }) : null,
            hosts.value >= 2 ? h(JourneyHost, { key: "b", handle }) : null,
          ]);
      },
    });
    mount(Root);
    await flushPromises();
    const id = runtime.listInstances()[0]!;
    // Both hosts share the one persisted instance.
    expect(runtime.listInstances()).toEqual([id]);
    expect(runtime.getInstance(id)?.status).toBe("active");

    // Unmount the newer host (b) first — the older host (a) still owns the id.
    hosts.value = 1;
    await flushPromises();
    expect(runtime.getInstance(id)?.status).toBe("active");

    // Unmount the last owner — now it ends and forgets.
    hosts.value = 0;
    await flushPromises();
    expect(runtime.getInstance(id)).toBeNull();
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
