import { Suspense } from "react";
import type { ReactElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";

import { defineJourney } from "./define-journey.js";
import { defineTransition } from "./define-transition.js";
import { createJourneyRuntime } from "./runtime.js";
import { JourneyOutlet } from "./outlet.js";

// Capture once at import time so afterEach can restore whatever the host
// environment set (most likely `undefined` under happy-dom, but a downstream
// test runner could shim it). Without restoration, deleting the global here
// would leak across test files on shared workers.
const globalWithRic = globalThis as typeof globalThis & { requestIdleCallback?: unknown };
const originalRequestIdleCallback = globalWithRic.requestIdleCallback;

afterEach(() => {
  cleanup();
  if (originalRequestIdleCallback === undefined) {
    delete globalWithRic.requestIdleCallback;
  } else {
    globalWithRic.requestIdleCallback = originalRequestIdleCallback;
  }
});

beforeEach(() => {
  // happy-dom doesn't ship requestIdleCallback. Force the setTimeout(_, 0)
  // fallback explicitly so the assertion is unambiguous.
  delete globalWithRic.requestIdleCallback;
});

// --- Per-test factory ---------------------------------------------------------

const startExits = {
  toCheap: defineExit(),
  toExpensive: defineExit(),
} as const;

function StartScreen({ exit }: ModuleEntryProps<void, typeof startExits>): ReactElement {
  return (
    <div>
      <span data-testid="start">start</span>
      <button onClick={() => exit("toCheap")}>cheap</button>
      <button onClick={() => exit("toExpensive")}>expensive</button>
    </div>
  );
}

const cheapExits = { done: defineExit() } as const;
function CheapStep(_props: ModuleEntryProps<void, typeof cheapExits>): ReactElement {
  return <span data-testid="cheap">cheap step</span>;
}

const expensiveExits = { done: defineExit() } as const;
function ExpensiveStep(_props: ModuleEntryProps<void, typeof expensiveExits>): ReactElement {
  return <span data-testid="expensive">expensive step</span>;
}

const unrelatedExits = { done: defineExit() } as const;
function UnrelatedStep(_props: ModuleEntryProps<void, typeof unrelatedExits>): ReactElement {
  return <span data-testid="unrelated">unrelated step</span>;
}

interface PreloadFixtures {
  readonly cheapImporter: Mock;
  readonly expensiveImporter: Mock;
  readonly unrelatedImporter: Mock;
  readonly modules: Readonly<{
    start: ReturnType<typeof defineModule>;
    cheap: ReturnType<typeof defineModule>;
    expensive: ReturnType<typeof defineModule>;
    unrelated: ReturnType<typeof defineModule>;
  }>;
}

// Each test gets fresh mock importers + fresh entry objects, so the
// process-wide `WeakMap` inside `resolveEntryComponent` doesn't bleed
// state across tests.
function makeFixtures(): PreloadFixtures {
  const cheapImporter = vi.fn(() => Promise.resolve({ default: CheapStep }));
  const expensiveImporter = vi.fn(() => Promise.resolve({ default: ExpensiveStep }));
  const unrelatedImporter = vi.fn(() => Promise.resolve({ default: UnrelatedStep }));

  const startModule = defineModule({
    id: "start",
    version: "1.0.0",
    exitPoints: startExits,
    entryPoints: {
      pick: defineEntry({ component: StartScreen, input: schema<void>() }),
    },
  });
  const cheapModule = defineModule({
    id: "cheap",
    version: "1.0.0",
    exitPoints: cheapExits,
    entryPoints: {
      show: defineEntry({ lazy: cheapImporter, input: schema<void>() }),
    },
  });
  const expensiveModule = defineModule({
    id: "expensive",
    version: "1.0.0",
    exitPoints: expensiveExits,
    entryPoints: {
      show: defineEntry({ lazy: expensiveImporter, input: schema<void>() }),
    },
  });
  const unrelatedModule = defineModule({
    id: "unrelated",
    version: "1.0.0",
    exitPoints: unrelatedExits,
    entryPoints: {
      show: defineEntry({ lazy: unrelatedImporter, input: schema<void>() }),
    },
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
          toCheap: () => ({
            next: { module: "cheap", entry: "show", input: undefined as never },
          }),
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

async function flushIdle() {
  await act(async () => {
    await new Promise<void>((res) => setTimeout(res, 0));
  });
}

// --- Tests --------------------------------------------------------------------

describe("JourneyOutlet — auto-preload (precise, default)", () => {
  it("preloads only the entries declared by annotated transition handlers", async () => {
    const fx = makeFixtures();
    const journey = makeAnnotatedJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("annotated", undefined as never);
    render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={fx.modules} />
      </Suspense>,
    );
    await flushIdle();
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
    expect(fx.unrelatedImporter).not.toHaveBeenCalled();
  });

  it("skips terminal sentinels when collecting preload candidates", async () => {
    // A handler whose only declared outcome is a sentinel ("abort") has
    // nothing to preload — the outlet must not interpret the string as a
    // module/entry pair.
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
    render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={fx.modules} />
      </Suspense>,
    );
    await flushIdle();
    // `cheap` is never preloaded — `toCheap`'s only target is the abort sentinel.
    expect(fx.cheapImporter).not.toHaveBeenCalled();
    // `expensive/show` IS preloaded (the object ref); the `"complete"`
    // sentinel sitting next to it is silently skipped, not crashed on.
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
  });

  it("does not preload anything when handlers are bare functions (no `targets`)", async () => {
    const fx = makeFixtures();
    const journey = makeBareJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("bare", undefined as never);
    render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={fx.modules} />
      </Suspense>,
    );
    await flushIdle();
    expect(fx.cheapImporter).not.toHaveBeenCalled();
    expect(fx.expensiveImporter).not.toHaveBeenCalled();
  });

  it("re-runs the preload set when the step advances", async () => {
    // Targets vary by exit (`toCheap` → cheap/show; `toExpensive` → expensive/show).
    // Pick `cheap` first; only that chunk is preloaded. Then advance to it and
    // verify nothing new is scheduled for the now-current step (its own
    // transitions in this fixture are empty, so no further preload).
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
    const { getByText } = render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={fx.modules} />
      </Suspense>,
    );
    await flushIdle();
    // First step's targets: cheap/show + expensive/show.
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
    expect(fx.unrelatedImporter).not.toHaveBeenCalled();

    // Advance to cheap/show — the next step's targets reference unrelated/show,
    // which should now be preloaded.
    await act(async () => {
      getByText("cheap").click();
    });
    await flushIdle();
    expect(fx.unrelatedImporter).toHaveBeenCalledTimes(1);
    // Already-preloaded chunks aren't re-fetched (idempotent).
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
  });
});

describe("JourneyOutlet — auto-preload (precise) with scoped module ids", () => {
  it("splits `${module}/${entry}` on the LAST slash so scoped ids round-trip", async () => {
    // Module id contains a slash (npm-style scope). The preloader must
    // split on the LAST `/` or it would look up `@scope` instead of
    // `@scope/billing`.
    const importer = vi.fn(() => Promise.resolve({ default: CheapStep }));
    const scopedExits = { done: defineExit() } as const;
    const scopedModule = defineModule({
      id: "@scope/billing",
      version: "1.0.0",
      exitPoints: scopedExits,
      entryPoints: {
        review: defineEntry({ lazy: importer, input: schema<void>() }),
      },
    });
    const startMod = defineModule({
      id: "start",
      version: "1.0.0",
      exitPoints: { go: defineExit() } as const,
      entryPoints: {
        pick: defineEntry({ component: StartScreen, input: schema<void>() }),
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
                next: {
                  module: "@scope/billing",
                  entry: "review",
                  input: undefined as never,
                },
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
    render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={localModules} />
      </Suspense>,
    );
    await flushIdle();
    expect(importer).toHaveBeenCalledTimes(1);
  });
});

describe("JourneyOutlet — auto-preload (aggressive)", () => {
  it('preloads every entry referenced as a transition source when `preload="aggressive"`', async () => {
    const fx = makeFixtures();
    const journey = makeBareJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("bare", undefined as never);
    render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={fx.modules} preload="aggressive" />
      </Suspense>,
    );
    await flushIdle();
    // `start/pick` is the current step → skipped. `cheap/show` and
    // `expensive/show` are both transition sources → preloaded.
    expect(fx.cheapImporter).toHaveBeenCalledTimes(1);
    expect(fx.expensiveImporter).toHaveBeenCalledTimes(1);
    // `unrelated` is registered as a module but is not a transition source
    // anywhere in this journey → not preloaded even in aggressive mode.
    expect(fx.unrelatedImporter).not.toHaveBeenCalled();
  });

  it("preloads destination-only entries reached via annotated `targets:` even when they have no outbound transitions", async () => {
    // The shape this test guards against: an entry that's a destination of
    // some annotated handler but is itself terminal (no outbound transitions
    // wired). Source-keys-only enumeration would miss it; the
    // destinations-side pass through annotated targets must close the gap.
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
            // `unrelated/show` is the destination — it has NO outbound
            // transitions of its own, so source-keys enumeration would
            // skip it. The annotated target must surface it.
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
    render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={fx.modules} preload="aggressive" />
      </Suspense>,
    );
    await flushIdle();
    expect(fx.unrelatedImporter).toHaveBeenCalledTimes(1);
  });
});

describe("JourneyOutlet — auto-preload (off)", () => {
  it("does not preload when `preload={false}`", async () => {
    const fx = makeFixtures();
    const journey = makeAnnotatedJourney(fx.modules);
    const rt = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: fx.modules,
      debug: false,
    });
    const id = rt.start("annotated", undefined as never);
    render(
      <Suspense fallback={null}>
        <JourneyOutlet runtime={rt} instanceId={id} modules={fx.modules} preload={false} />
      </Suspense>,
    );
    await flushIdle();
    expect(fx.cheapImporter).not.toHaveBeenCalled();
    expect(fx.expensiveImporter).not.toHaveBeenCalled();
  });
});

describe("JourneyOutlet — lazy step rendering", () => {
  it("renders the entry's `fallback` while the lazy chunk loads, then the resolved component", async () => {
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
      exitPoints: cheapExits,
      entryPoints: {
        show: defineEntry({
          lazy: cheapDeferredImporter,
          fallback: <span data-testid="cheap-fallback">loading…</span>,
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
      start: () => ({
        module: "cheap-deferred",
        entry: "show",
        input: undefined as never,
      }),
      transitions: {},
    });
    const rt = createJourneyRuntime([{ definition: localJourney, options: undefined }], {
      modules: localModules,
      debug: false,
    });
    const id = rt.start("deferred", undefined as never);
    const { getByTestId } = render(
      <JourneyOutlet runtime={rt} instanceId={id} modules={localModules} preload={false} />,
    );
    expect(getByTestId("cheap-fallback")).toBeTruthy();
    expect(cheapDeferredImporter).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCheap({ default: CheapStep });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId("cheap")).toBeTruthy();
    });
  });
});
