import { defineComponent, h, nextTick, ref, type PropType } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import {
  createJourneyRuntime,
  defineJourney,
  getInternals,
} from "@modular-frontend/journeys-engine";
import { JourneyOutlet } from "./outlet.js";

// --- Modules with real components --------------------------------------------

const accountExits = { goNext: defineExit<{ amount: number }>() } as const;

const ReviewAccount = defineComponent({
  name: "ReviewAccount",
  props: {
    input: { type: Object as PropType<{ customerId: string }>, required: true },
    exit: { type: Function as PropType<(n: string, o?: unknown) => void>, required: true },
    goBack: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    return () =>
      h("div", [
        h("div", { "data-testid": "review-customer" }, props.input.customerId),
        props.goBack
          ? h(
              "button",
              { "data-testid": "back-from-review", onClick: () => props.goBack!() },
              "back",
            )
          : null,
        h(
          "button",
          { "data-testid": "next", onClick: () => props.exit("goNext", { amount: 42 }) },
          "next",
        ),
      ]);
  },
});

const accountModule = defineModule({
  id: "account",
  version: "1.0.0",
  exitPoints: accountExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewAccount as never,
      input: schema<{ customerId: string }>(),
    }),
  },
});

const debtsExits = { done: defineExit<{ amount: number }>() } as const;

const Negotiate = defineComponent({
  name: "Negotiate",
  props: {
    input: { type: Object as PropType<{ amount: number }>, required: true },
    exit: { type: Function as PropType<(n: string, o?: unknown) => void>, required: true },
    goBack: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    return () =>
      h("div", [
        h("div", { "data-testid": "negotiate-amount" }, String(props.input.amount)),
        props.goBack
          ? h(
              "button",
              { "data-testid": "back-from-negotiate", onClick: () => props.goBack!() },
              "back",
            )
          : null,
        h(
          "button",
          {
            "data-testid": "finish",
            onClick: () => props.exit("done", { amount: props.input.amount }),
          },
          "finish",
        ),
      ]);
  },
});

const debtsModule = defineModule({
  id: "debts",
  version: "1.0.0",
  exitPoints: debtsExits,
  entryPoints: {
    negotiate: defineEntry({
      component: Negotiate as never,
      input: schema<{ amount: number }>(),
      allowBack: "preserve-state",
    }),
  },
});

type Modules = { readonly account: typeof accountModule; readonly debts: typeof debtsModule };

const journey = defineJourney<Modules, { customerId: string }>()({
  id: "demo",
  version: "1.0.0",
  initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
  start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
  transitions: {
    account: {
      review: {
        goNext: ({ output }) => ({
          next: { module: "debts", entry: "negotiate", input: { amount: output.amount } },
        }),
      },
    },
    debts: {
      negotiate: {
        allowBack: true,
        done: ({ output }) => ({ complete: { amount: output.amount } }),
      },
    },
  },
});

const modules = { account: accountModule, debts: debtsModule };

function makeRuntime() {
  return createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules,
    debug: false,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JourneyOutlet", () => {
  it("renders the start step's component with its input", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-1" });
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules } });
    expect(wrapper.get('[data-testid="review-customer"]').text()).toBe("C-1");
  });

  it("re-renders after a transition", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-2" });
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules } });
    await wrapper.get('[data-testid="next"]').trigger("click");
    expect(wrapper.get('[data-testid="negotiate-amount"]').text()).toBe("42");
  });

  it("does not render goBack when history is empty", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-3" });
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules } });
    expect(wrapper.find('[data-testid="back-from-review"]').exists()).toBe(false);
  });

  it("renders goBack on the second step and returns to the first step when clicked", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-4" });
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules } });
    await wrapper.get('[data-testid="next"]').trigger("click");
    expect(wrapper.find('[data-testid="negotiate-amount"]').exists()).toBe(true);
    await wrapper.get('[data-testid="back-from-negotiate"]').trigger("click");
    expect(wrapper.get('[data-testid="review-customer"]').text()).toBe("C-4");
  });

  it("fires onFinished once on completion with the terminal payload and ids", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-5" });
    const onFinished = vi.fn();
    const wrapper = mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, modules, onFinished },
    });
    await wrapper.get('[data-testid="next"]').trigger("click");
    await wrapper.get('[data-testid="finish"]').trigger("click");
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith({
      status: "completed",
      payload: { amount: 42 },
      instanceId: id,
      journeyId: "demo",
    });
  });

  it("abandons the instance on unmount when still active", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-6" });
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules } });
    wrapper.unmount();
    // Abandon is deferred one microtask so a same-tick handoff to a sibling
    // outlet keeps the instance alive; a lone unmount ends it.
    await Promise.resolve();
    expect(rt.getInstance(id)!.status).toBe("aborted");
  });

  it("keeps the instance alive when a second outlet takes over before the abandon fires", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-7" });
    // Outlet A mounts, outlet B mounts (both attached), outlet A unmounts. The
    // listener-count check in the cleanup microtask keeps the instance alive
    // because outlet B is still subscribed.
    const outletA = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules } });
    mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules } });
    outletA.unmount();
    await Promise.resolve();
    expect(rt.getInstance(id)!.status).toBe("active");
    const internals = getInternals(rt);
    expect(internals.__getRecord(id)!.listeners.size).toBeGreaterThan(0);
  });

  it("survives a same-tick keyed handoff: outlet A unmounts and outlet B mounts in one patch", async () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-7c" });
    const which = ref<"a" | "b">("a");
    const Wrapper = defineComponent({
      setup() {
        return () => h(JourneyOutlet, { key: which.value, runtime: rt, instanceId: id, modules });
      },
    });
    mount(Wrapper);
    which.value = "b";
    await nextTick();
    await Promise.resolve();
    const internals = getInternals(rt);
    const record = internals.__getRecord(id);
    expect(record).toBeDefined();
    expect(record!.status).toBe("active");
    // Outlet B took over the subscription during the patch.
    expect(record!.listeners.size).toBeGreaterThan(0);
  });

  it("renders loadingFallback while the instance is in loading status", async () => {
    let resolveLoad: (blob: null) => void = () => {};
    const loadPromise = new Promise<null>((r) => {
      resolveLoad = r;
    });
    const rt = createJourneyRuntime(
      [
        {
          definition: journey,
          options: {
            persistence: {
              keyFor: () => "k",
              load: () => loadPromise,
              save: () => {},
              remove: () => {},
            },
          },
        },
      ],
      { modules, debug: false },
    );
    const id = rt.start("demo", { customerId: "C-8" });
    const wrapper = mount(JourneyOutlet, {
      props: {
        runtime: rt,
        instanceId: id,
        modules,
        loadingFallback: () => h("div", "please wait"),
      },
    });
    expect(wrapper.text()).toContain("please wait");
    resolveLoad(null);
    await flushPromises();
  });

  it("caps onStepError retries before falling back to abort", async () => {
    const Throwing = defineComponent({
      name: "Throwing",
      setup() {
        return () => {
          throw new Error("boom");
        };
      },
    });
    const throwingModule = defineModule({
      id: "account",
      version: "1.0.0",
      exitPoints: accountExits,
      entryPoints: {
        review: defineEntry({
          component: Throwing as never,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const localModules = { account: throwingModule, debts: debtsModule };
    const throwingJourney = defineJourney<
      { readonly account: typeof throwingModule; readonly debts: typeof debtsModule },
      { customerId: string }
    >()({
      id: "throwing",
      version: "1.0.0",
      initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
      start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
      transitions: {},
    });
    const rt = createJourneyRuntime(
      [{ definition: throwingJourney as never, options: undefined }],
      {
        modules: localModules,
        debug: false,
      },
    );
    const id = rt.start("throwing", { customerId: "C-9" });
    const onStepError = vi.fn(() => "retry" as const);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mount(JourneyOutlet, {
      props: {
        runtime: rt,
        instanceId: id,
        modules: localModules,
        onStepError,
        retryLimit: 1,
      },
    });
    await flushPromises();
    // Initial render throws, retry runs once, retry throws, budget exhausted,
    // falls back to abort.
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(onStepError.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("renders a custom notFoundComponent when the step's module is not in the map", () => {
    const rt = makeRuntime();
    const id = rt.start("demo", { customerId: "C-nf" });
    const NotFound = defineComponent({
      props: {
        moduleId: { type: String, required: true },
        entry: { type: String, required: true },
      },
      setup(props) {
        return () =>
          h("div", { "data-testid": "custom-not-found" }, `${props.moduleId}/${props.entry}`);
      },
    });
    const wrapper = mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, modules: {}, notFoundComponent: NotFound },
    });
    expect(wrapper.get('[data-testid="custom-not-found"]').text()).toBe("account/review");
  });

  it("renders a custom errorComponent when a step throws", async () => {
    const Throwing = defineComponent({
      name: "Throwing",
      setup() {
        return () => {
          throw new Error("oh no");
        };
      },
    });
    const throwingModule = defineModule({
      id: "account",
      version: "1.0.0",
      exitPoints: accountExits,
      entryPoints: {
        review: defineEntry({
          component: Throwing as never,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const localModules = { account: throwingModule, debts: debtsModule };
    const throwingJourney = defineJourney<
      { readonly account: typeof throwingModule; readonly debts: typeof debtsModule },
      { customerId: string }
    >()({
      id: "custom-err",
      version: "1.0.0",
      initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
      start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
      transitions: {},
    });
    const rt = createJourneyRuntime(
      [{ definition: throwingJourney as never, options: undefined }],
      {
        modules: localModules,
        debug: false,
      },
    );
    const id = rt.start("custom-err", { customerId: "C-e" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ErrorFallback = defineComponent({
      props: {
        moduleId: { type: String, required: true },
        error: { type: null, default: undefined },
      },
      setup(props) {
        return () => {
          const err = props.error as unknown;
          return h(
            "div",
            { "data-testid": "custom-error" },
            `${props.moduleId}:${err instanceof Error ? err.message : String(err)}`,
          );
        };
      },
    });
    const wrapper = mount(JourneyOutlet, {
      props: {
        runtime: rt,
        instanceId: id,
        modules: localModules,
        onStepError: () => "ignore" as const,
        errorComponent: ErrorFallback,
      },
    });
    await nextTick();
    expect(wrapper.get('[data-testid="custom-error"]').text()).toBe("account:oh no");
  });

  it("renders the step-error fallback card when onStepError returns 'ignore'", async () => {
    const Throwing = defineComponent({
      name: "Throwing",
      setup() {
        return () => {
          throw new Error("kaboom");
        };
      },
    });
    const throwingModule = defineModule({
      id: "account",
      version: "1.0.0",
      exitPoints: accountExits,
      entryPoints: {
        review: defineEntry({
          component: Throwing as never,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const localModules = { account: throwingModule, debts: debtsModule };
    const throwingJourney = defineJourney<
      { readonly account: typeof throwingModule; readonly debts: typeof debtsModule },
      { customerId: string }
    >()({
      id: "ignoring",
      version: "1.0.0",
      initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
      start: (s) => ({ module: "account", entry: "review", input: { customerId: s.customerId } }),
      transitions: {},
    });
    const rt = createJourneyRuntime(
      [{ definition: throwingJourney as never, options: undefined }],
      {
        modules: localModules,
        debug: false,
      },
    );
    const id = rt.start("ignoring", { customerId: "C-ignore" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mount(JourneyOutlet, {
      props: {
        runtime: rt,
        instanceId: id,
        modules: localModules,
        onStepError: () => "ignore" as const,
      },
    });
    await nextTick();
    // Instance stays active — `ignore` keeps the boundary UI up without
    // aborting. The fallback card must be visible.
    expect(rt.getInstance(id)!.status).toBe("active");
    expect(wrapper.find('[data-journey-step-error="account"]').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/encountered an error/i);
    expect(wrapper.text()).toMatch(/kaboom/);
  });
});
