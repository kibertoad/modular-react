import { defineComponent, h, type PropType } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import {
  createJourneyRuntime,
  defineJourney,
  defineTransition,
} from "@modular-frontend/journeys-engine";
import { JourneyOutlet } from "./outlet.js";

// happy-dom doesn't ship requestIdleCallback; force the setTimeout(_, 0)
// fallback so the assertions are unambiguous (matches the React source).
const globalWithRic = globalThis as typeof globalThis & { requestIdleCallback?: unknown };
const originalRequestIdleCallback = globalWithRic.requestIdleCallback;

beforeEach(() => {
  delete globalWithRic.requestIdleCallback;
});
afterEach(() => {
  if (originalRequestIdleCallback === undefined) delete globalWithRic.requestIdleCallback;
  else globalWithRic.requestIdleCallback = originalRequestIdleCallback;
});

// --- Components --------------------------------------------------------------

const startExits = { toCheap: defineExit(), toExpensive: defineExit() } as const;
const StartScreen = defineComponent({
  name: "StartScreen",
  props: { exit: { type: Function as PropType<(n: string) => void>, required: true } },
  setup(props) {
    return () =>
      h("div", [
        h("span", { "data-testid": "start" }, "start"),
        h("button", { "data-testid": "cheap", onClick: () => props.exit("toCheap") }, "cheap"),
        h(
          "button",
          { "data-testid": "expensive", onClick: () => props.exit("toExpensive") },
          "expensive",
        ),
      ]);
  },
});
const CheapStep = defineComponent({
  name: "CheapStep",
  setup() {
    return () => h("span", { "data-testid": "cheap" }, "cheap step");
  },
});
const ExpensiveStep = defineComponent({
  name: "ExpensiveStep",
  setup() {
    return () => h("span", { "data-testid": "expensive" }, "expensive step");
  },
});
const UnrelatedStep = defineComponent({
  name: "UnrelatedStep",
  setup() {
    return () => h("span", { "data-testid": "unrelated" }, "unrelated step");
  },
});

interface PreloadFixtures {
  readonly cheapImporter: Mock;
  readonly expensiveImporter: Mock;
  readonly unrelatedImporter: Mock;
  readonly modules: Record<string, ReturnType<typeof defineModule>>;
}

// Each test gets fresh mock importers + fresh entry objects, so the process-wide
// `WeakMap` inside `resolveEntryComponent` doesn't bleed state across tests.
function makeFixtures(): PreloadFixtures {
  const cheapImporter = vi.fn(() => Promise.resolve({ default: CheapStep }));
  const expensiveImporter = vi.fn(() => Promise.resolve({ default: ExpensiveStep }));
  const unrelatedImporter = vi.fn(() => Promise.resolve({ default: UnrelatedStep }));

  const startModule = defineModule({
    id: "start",
    version: "1.0.0",
    exitPoints: startExits,
    entryPoints: { pick: defineEntry({ component: StartScreen as never, input: schema<void>() }) },
  });
  const cheapModule = defineModule({
    id: "cheap",
    version: "1.0.0",
    exitPoints: { done: defineExit() },
    entryPoints: { show: defineEntry({ lazy: cheapImporter, input: schema<void>() }) },
  });
  const expensiveModule = defineModule({
    id: "expensive",
    version: "1.0.0",
    exitPoints: { done: defineExit() },
    entryPoints: { show: defineEntry({ lazy: expensiveImporter, input: schema<void>() }) },
  });
  const unrelatedModule = defineModule({
    id: "unrelated",
    version: "1.0.0",
    exitPoints: { done: defineExit() },
    entryPoints: { show: defineEntry({ lazy: unrelatedImporter, input: schema<void>() }) },
  });

  return {
    cheapImporter,
    expensiveImporter,
    unrelatedImporter,
    modules: {
      start: startModule,
      cheap: cheapModule,
      expensive: expensiveModule,
      unrelated: unrelatedModule,
    },
  };
}

function makeAnnotatedJourney(modules: PreloadFixtures["modules"]) {
  type M = typeof modules;
  return defineJourney<M, { _: true }>()({
    id: "annotated",
    version: "1.0.0",
    initialState: () => ({ _: true }) as const,
    start: () => ({ module: "start", entry: "pick", input: undefined as never }),
    transitions: {
      start: {
        pick: {
          toCheap: defineTransition({
            targets: [{ module: "cheap", entry: "show" }],
            handle: () => ({ next: { module: "cheap", entry: "show", input: undefined as never } }),
          }),
          toExpensive: defineTransition({
            targets: [{ module: "expensive", entry: "show" }],
            handle: () => ({
              next: { module: "expensive", entry: "show", input: undefined as never },
            }),
          }),
        },
      },
    },
  });
}

function makeBareJourney(modules: PreloadFixtures["modules"]) {
  type M = typeof modules;
  return defineJourney<M, { _: true }>()({
    id: "bare",
    version: "1.0.0",
    initialState: () => ({ _: true }) as const,
    start: () => ({ module: "start", entry: "pick", input: undefined as never }),
    transitions: {
      start: {
        pick: {
          toCheap: () => ({ next: { module: "cheap", entry: "show", input: undefined as never } }),
          toExpensive: () => ({
            next: { module: "expensive", entry: "show", input: undefined as never },
          }),
        },
      },
      cheap: { show: { done: () => ({ complete: undefined }) } },
      expensive: { show: { done: () => ({ complete: undefined }) } },
    },
  });
}

const flushIdle = () => new Promise<void>((res) => setTimeout(res, 0));

describe("JourneyOutlet — auto-preload (precise, default)", () => {
  it("preloads only the entries declared by annotated transition handlers", async () => {
    const fx = makeFixtures();
    const journey = makeAnnotatedJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("annotated", undefined as never);
    mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules: fx.modules } });
    await flushIdle();
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
    expect(fx.unrelatedImporter).not.toHaveBeenCalled();
  });

  it("skips terminal sentinels when collecting preload candidates", async () => {
    const fx = makeFixtures();
    type M = typeof fx.modules;
    const sentinelJourney = defineJourney<M, { _: true }>()({
      id: "sentinel-only",
      version: "1.0.0",
      initialState: () => ({ _: true }) as const,
      start: () => ({ module: "start", entry: "pick", input: undefined as never }),
      transitions: {
        start: {
          pick: {
            toCheap: defineTransition({
              targets: ["abort"] as const,
              handle: () => ({ abort: { reason: "user-cancelled" } }),
            }),
            toExpensive: defineTransition({
              targets: [{ module: "expensive", entry: "show" }, "complete"] as const,
              handle: () => ({ complete: undefined }),
            }),
          },
        },
      },
    });
    const rt = createJourneyRuntime([{ definition: sentinelJourney, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("sentinel-only", undefined as never);
    mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules: fx.modules } });
    await flushIdle();
    // `cheap` is never preloaded — `toCheap`'s only target is the abort sentinel.
    expect(fx.cheapImporter).not.toHaveBeenCalled();
    // `expensive/show` IS preloaded; the `"complete"` sentinel is skipped.
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
  });

  it("does not preload anything when handlers are bare functions (no targets)", async () => {
    const fx = makeFixtures();
    const journey = makeBareJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("bare", undefined as never);
    mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules: fx.modules } });
    await flushIdle();
    expect(fx.cheapImporter).not.toHaveBeenCalled();
    expect(fx.expensiveImporter).not.toHaveBeenCalled();
  });

  it("re-runs the preload set when the step advances", async () => {
    const fx = makeFixtures();
    type M = typeof fx.modules;
    const stepThroughJourney = defineJourney<M, { _: true }>()({
      id: "step-through",
      version: "1.0.0",
      initialState: () => ({ _: true }) as const,
      start: () => ({ module: "start", entry: "pick", input: undefined as never }),
      transitions: {
        start: {
          pick: {
            toCheap: defineTransition({
              targets: [{ module: "cheap", entry: "show" }],
              handle: () => ({
                next: { module: "cheap", entry: "show", input: undefined as never },
              }),
            }),
            toExpensive: defineTransition({
              targets: [{ module: "expensive", entry: "show" }],
              handle: () => ({
                next: { module: "expensive", entry: "show", input: undefined as never },
              }),
            }),
          },
        },
        cheap: {
          show: {
            done: defineTransition({
              targets: [{ module: "unrelated", entry: "show" }],
              handle: () => ({
                next: { module: "unrelated", entry: "show", input: undefined as never },
              }),
            }),
          },
        },
      },
    });
    const rt = createJourneyRuntime([{ definition: stepThroughJourney, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("step-through", undefined as never);
    const wrapper = mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, modules: fx.modules },
    });
    await flushIdle();
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
    expect(fx.unrelatedImporter).not.toHaveBeenCalled();

    // Advance to cheap/show — the next step's targets reference unrelated/show.
    await wrapper.get('[data-testid="cheap"]').trigger("click");
    await flushPromises();
    await flushIdle();
    expect(fx.unrelatedImporter).toHaveBeenCalledTimes(1);
    // Already-preloaded chunks aren't re-fetched (idempotent).
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
  });
});

describe("JourneyOutlet — auto-preload (precise) with scoped module ids", () => {
  it("resolves annotated targets whose module id contains a slash", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: CheapStep }));
    const scopedModule = defineModule({
      id: "@scope/billing",
      version: "1.0.0",
      exitPoints: { done: defineExit() },
      entryPoints: { review: defineEntry({ lazy: importer, input: schema<void>() }) },
    });
    const startMod = defineModule({
      id: "start",
      version: "1.0.0",
      exitPoints: { go: defineExit() },
      entryPoints: {
        pick: defineEntry({ component: StartScreen as never, input: schema<void>() }),
      },
    });
    const localModules = { start: startMod, "@scope/billing": scopedModule };
    type LocalModules = typeof localModules;
    const journey = defineJourney<LocalModules, { _: true }>()({
      id: "scoped",
      version: "1.0.0",
      initialState: () => ({ _: true }) as const,
      start: () => ({ module: "start", entry: "pick", input: undefined as never }),
      transitions: {
        start: {
          pick: {
            go: defineTransition({
              targets: [{ module: "@scope/billing", entry: "review" }],
              handle: () => ({
                next: { module: "@scope/billing", entry: "review", input: undefined as never },
              }),
            }),
          },
        },
      },
    });
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: localModules,
      debug: false,
    });
    const id = rt.start("scoped", undefined as never);
    mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, modules: localModules } });
    await flushIdle();
    expect(importer).toHaveBeenCalledTimes(1);
  });
});

describe("JourneyOutlet — auto-preload (aggressive)", () => {
  it("preloads every entry referenced as a transition source when preload=aggressive", async () => {
    const fx = makeFixtures();
    const journey = makeBareJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("bare", undefined as never);
    mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, modules: fx.modules, preload: "aggressive" },
    });
    await flushIdle();
    // `start/pick` is current → skipped. `cheap/show` + `expensive/show` are
    // transition sources → preloaded. `unrelated` is not a source → skipped.
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
    expect(fx.unrelatedImporter).not.toHaveBeenCalled();
  });

  it("preloads destination-only entries reached via annotated targets", async () => {
    const fx = makeFixtures();
    type M = typeof fx.modules;
    const destOnlyJourney = defineJourney<M, { _: true }>()({
      id: "dest-only",
      version: "1.0.0",
      initialState: () => ({ _: true }) as const,
      start: () => ({ module: "start", entry: "pick", input: undefined as never }),
      transitions: {
        start: {
          pick: {
            toUnrelated: defineTransition({
              targets: [{ module: "unrelated", entry: "show" }],
              handle: () => ({
                next: { module: "unrelated", entry: "show", input: undefined as never },
              }),
            }),
          },
        },
      },
    });
    const rt = createJourneyRuntime([{ definition: destOnlyJourney, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("dest-only", undefined as never);
    mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, modules: fx.modules, preload: "aggressive" },
    });
    await flushIdle();
    expect(fx.unrelatedImporter).toHaveBeenCalledTimes(1);
  });
});

describe("JourneyOutlet — auto-preload (off)", () => {
  it("does not preload when preload=false", async () => {
    const fx = makeFixtures();
    const journey = makeAnnotatedJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("annotated", undefined as never);
    mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, modules: fx.modules, preload: false },
    });
    await flushIdle();
    expect(fx.cheapImporter).not.toHaveBeenCalled();
    expect(fx.expensiveImporter).not.toHaveBeenCalled();
  });
});

describe("JourneyOutlet — lazy step rendering", () => {
  it("renders the entry's fallback while the lazy chunk loads, then the resolved component", async () => {
    let resolveCheap!: (mod: { default: typeof CheapStep }) => void;
    const cheapDeferredImporter = vi.fn(
      () =>
        new Promise<{ default: typeof CheapStep }>((res) => {
          resolveCheap = res;
        }),
    );
    const cheapDeferredModule = defineModule({
      id: "cheap-deferred",
      version: "1.0.0",
      exitPoints: { done: defineExit() },
      entryPoints: {
        show: defineEntry({
          lazy: cheapDeferredImporter,
          fallback: (() => h("span", { "data-testid": "cheap-fallback" }, "loading…")) as never,
          input: schema<void>(),
        }),
      },
    });
    const localModules = { "cheap-deferred": cheapDeferredModule };
    type LocalModules = typeof localModules;
    const localJourney = defineJourney<LocalModules, { _: true }>()({
      id: "deferred",
      version: "1.0.0",
      initialState: () => ({ _: true }) as const,
      start: () => ({ module: "cheap-deferred", entry: "show", input: undefined as never }),
      transitions: {},
    });
    const rt = createJourneyRuntime([{ definition: localJourney, options: undefined }], {
      modules: localModules,
      debug: false,
    });
    const id = rt.start("deferred", undefined as never);
    const wrapper = mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, modules: localModules, preload: false },
    });
    expect(wrapper.find('[data-testid="cheap-fallback"]').exists()).toBe(true);
    expect(cheapDeferredImporter).toHaveBeenCalledTimes(1);
    resolveCheap({ default: CheapStep });
    await flushPromises();
    expect(wrapper.find('[data-testid="cheap"]').exists()).toBe(true);
  });
});
