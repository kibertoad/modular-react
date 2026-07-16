import { defineComponent, h, type ComputedRef, type ShallowRef } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import type { JourneyInstance } from "@modular-frontend/journeys-engine";

import { createJourneyRuntime, defineJourney } from "@modular-frontend/journeys-engine";
import { defineJourneyHandle } from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import { JourneyProvider } from "./provider.js";
import {
  useActiveLeafJourneyInstance,
  useActiveLeafJourneyState,
  useJourneyInstance,
  useJourneyState,
} from "./use-journey-state.js";

interface ParentState {
  readonly counter: number;
}

interface ChildState {
  readonly note: string;
}

const exits = {
  bump: defineExit(),
  start: defineExit(),
  finish: defineExit(),
} as const;

const parentMod = defineModule({
  id: "parent",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    home: defineEntry({
      component: (() => null) as never,
      input: schema<void>(),
    }),
  },
});

const childMod = defineModule({
  id: "child",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    page: defineEntry({
      component: (() => null) as never,
      input: schema<void>(),
    }),
  },
});

type ParentModules = { readonly parent: typeof parentMod };
type ChildModules = { readonly child: typeof childMod };

const childJourney = defineJourney<ChildModules, ChildState>()({
  id: "child",
  version: "1.0.0",
  initialState: () => ({ note: "initial" }),
  start: () => ({ module: "child", entry: "page", input: undefined }),
  transitions: {
    child: {
      page: {
        finish: ({ state }) => ({
          state: { ...state, note: "finished" },
          complete: undefined,
        }),
      },
    },
  },
});
const childHandle = defineJourneyHandle(childJourney);

const parentJourney = defineJourney<ParentModules, ParentState>()({
  id: "parent",
  version: "1.0.0",
  invokes: [childHandle],
  initialState: () => ({ counter: 0 }),
  start: () => ({ module: "parent", entry: "home", input: undefined }),
  transitions: {
    parent: {
      home: {
        bump: ({ state }) => ({ state: { counter: state.counter + 1 } }),
        start: () => ({ invoke: { handle: childHandle, input: undefined, resume: "back" } }),
      },
    },
  },
  resumes: {
    parent: {
      home: {
        back: ({ state }) => ({ state: { counter: state.counter + 10 } }),
      },
    },
  },
});

function setupRuntime() {
  return createJourneyRuntime([
    { definition: parentJourney, options: undefined },
    { definition: childJourney, options: undefined },
  ]);
}

/** Mount a probe under a JourneyProvider and hand back the captured ref. */
function mountUnderProvider<T>(runtime: ReturnType<typeof setupRuntime>, capture: () => T): T {
  let captured!: T;
  const Probe = defineComponent({
    setup() {
      captured = capture();
      return () => null;
    },
  });
  mount(JourneyProvider, {
    props: { runtime },
    slots: { default: () => h(Probe) },
  });
  return captured;
}

describe("useJourneyState", () => {
  it("subscribes to the instance and tracks state changes", async () => {
    const runtime = setupRuntime();
    const id = runtime.start(parentJourney.id, undefined);

    const state = mountUnderProvider<ComputedRef<ParentState | null>>(runtime, () =>
      useJourneyState<ParentState>(id),
    );

    expect(state.value).toEqual({ counter: 0 });

    const reg = runtime.listInstances();
    expect(reg).toContain(id);
    // Drive a state change through the runtime's harness.
    createTestHarness(runtime).fireExit(id, "bump");
    await flushPromises();

    expect(state.value).toEqual({ counter: 1 });
  });

  it("returns null when no runtime is mounted", () => {
    let observed: ParentState | null | undefined = undefined;
    const Probe = defineComponent({
      setup() {
        observed = useJourneyState<ParentState>("nope").value;
        return () => null;
      },
    });
    mount(Probe);
    expect(observed).toBeNull();
  });
});

describe("useJourneyInstance", () => {
  it("exposes the full snapshot (status / step / state) and tracks changes", async () => {
    const runtime = setupRuntime();
    const id = runtime.start(parentJourney.id, undefined);

    const inst = mountUnderProvider<ShallowRef<JourneyInstance | null>>(runtime, () =>
      useJourneyInstance(id),
    );

    // Unlike `useJourneyState`, the instance form surfaces step / status too.
    expect(inst.value?.step?.moduleId).toBe("parent");
    expect(inst.value?.journeyId).toBe("parent");
    expect(inst.value?.state).toEqual({ counter: 0 });

    createTestHarness(runtime).fireExit(id, "bump");
    await flushPromises();

    expect(inst.value?.state).toEqual({ counter: 1 });
  });

  it("returns null when no runtime is mounted", () => {
    let observed: JourneyInstance | null | undefined = undefined;
    const Probe = defineComponent({
      setup() {
        observed = useJourneyInstance("nope").value;
        return () => null;
      },
    });
    mount(Probe);
    expect(observed).toBeNull();
  });
});

describe("useActiveLeafJourneyState", () => {
  it("follows the activeChildId chain and returns the leaf instance's state", async () => {
    const runtime = setupRuntime();
    const rootId = runtime.start(parentJourney.id, undefined);

    const state = mountUnderProvider<ComputedRef<ChildState | ParentState | null>>(runtime, () =>
      useActiveLeafJourneyState<ChildState | ParentState>(rootId),
    );

    // Initially no child — the leaf is the parent itself.
    expect(state.value).toEqual({ counter: 0 });

    createTestHarness(runtime).fireExit(rootId, "start");
    await flushPromises();

    // Sanity: the parent actually invoked the child.
    expect(runtime.getInstance(rootId)?.activeChildId).toBeTruthy();
    // Parent has invoked the child — leaf is the child's state.
    expect(state.value).toEqual({ note: "initial" });

    const inst = runtime.getInstance(rootId);
    const childId = inst!.activeChildId!;
    createTestHarness(runtime).fireExit(childId, "finish");
    await flushPromises();

    // Child completed — leaf collapses back to the parent (now counter: 10).
    expect(state.value).toEqual({ counter: 10 });
  });
});

describe("useActiveLeafJourneyInstance", () => {
  it("returns the full leaf JourneyInstance so callers can read step/status", async () => {
    const runtime = setupRuntime();
    const rootId = runtime.start(parentJourney.id, undefined);

    const inst = mountUnderProvider<ShallowRef<JourneyInstance | null>>(runtime, () =>
      useActiveLeafJourneyInstance(rootId),
    );

    const read = () => ({ moduleId: inst.value?.step?.moduleId, journeyId: inst.value?.journeyId });

    // No child yet — leaf is the parent's "parent.home" step.
    expect(read()).toEqual({ moduleId: "parent", journeyId: "parent" });

    createTestHarness(runtime).fireExit(rootId, "start");
    await flushPromises();

    // After invoke — the composable returns the child instance, so callers can
    // read `step.moduleId` directly without a separate `getInstance(leafId)`.
    expect(read()).toEqual({ moduleId: "child", journeyId: "child" });
  });
});
