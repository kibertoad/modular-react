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

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // happy-dom doesn't ship requestIdleCallback. Force the setTimeout(_, 0)
  // fallback explicitly so the assertion is unambiguous.
  delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
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
            targets: ["cheap/show"] as const,
            handle: () => ({
              next: { module: "cheap", entry: "show", input: undefined as never },
            }),
          }),
          toExpensive: defineTransition({
            targets: ["expensive/show"] as const,
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
