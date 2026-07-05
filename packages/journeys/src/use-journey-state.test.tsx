import { act, cleanup, render } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { afterEach, describe, expect, it } from "vitest";

import { defineJourney } from "@modular-frontend/journeys-engine";
import { defineJourneyHandle } from "@modular-frontend/journeys-engine";
import { JourneyProvider } from "./provider.js";
import { createJourneyRuntime } from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import {
  useActiveLeafJourneyInstance,
  useActiveLeafJourneyState,
  useJourneyState,
} from "./use-journey-state.js";

afterEach(() => {
  cleanup();
});

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

describe("useJourneyState", () => {
  it("subscribes to the instance and re-renders on state changes", () => {
    const runtime = setupRuntime();
    const id = runtime.start(parentJourney.id, undefined);
    const seen: (ParentState | null)[] = [];

    function Probe() {
      const state = useJourneyState<ParentState>(id);
      seen.push(state);
      return null;
    }

    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    expect(seen.at(-1)).toEqual({ counter: 0 });

    act(() => {
      // Drive a state change through the runtime's harness.
      const reg = runtime.listInstances();
      expect(reg).toContain(id);
      // Use a test-harness fireExit to flip state to counter: 1.
      createTestHarness(runtime).fireExit(id, "bump");
    });

    expect(seen.at(-1)).toEqual({ counter: 1 });
  });

  it("returns null when no runtime is mounted", () => {
    let observed: ParentState | null | undefined = undefined;
    function Probe() {
      observed = useJourneyState<ParentState>("nope");
      return null;
    }
    render(<Probe />);
    expect(observed).toBeNull();
  });
});

describe("useActiveLeafJourneyState", () => {
  it("follows the activeChildId chain and returns the leaf instance's state", () => {
    const runtime = setupRuntime();
    const rootId = runtime.start(parentJourney.id, undefined);
    const seen: (ChildState | ParentState | null)[] = [];

    function Probe() {
      const state = useActiveLeafJourneyState<ChildState | ParentState>(rootId);
      seen.push(state);
      return null;
    }

    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    // Initially no child — the leaf is the parent itself.
    expect(seen.at(-1)).toEqual({ counter: 0 });

    act(() => {
      createTestHarness(runtime).fireExit(rootId, "start");
    });

    // Sanity: the parent actually invoked the child.
    expect(runtime.getInstance(rootId)?.activeChildId).toBeTruthy();
    // Parent has invoked the child — leaf is the child's state.
    expect(seen.at(-1)).toEqual({ note: "initial" });

    act(() => {
      const inst = runtime.getInstance(rootId);
      const childId = inst!.activeChildId!;
      createTestHarness(runtime).fireExit(childId, "finish");
    });

    // Child completed — leaf collapses back to the parent (now counter: 10).
    expect(seen.at(-1)).toEqual({ counter: 10 });
  });
});

describe("useActiveLeafJourneyInstance", () => {
  it("returns the full leaf JourneyInstance so callers can read step/status without pairing hooks", () => {
    const runtime = setupRuntime();
    const rootId = runtime.start(parentJourney.id, undefined);
    const seen: { moduleId: string | undefined; journeyId: string | undefined }[] = [];

    function Probe() {
      const inst = useActiveLeafJourneyInstance(rootId);
      seen.push({ moduleId: inst?.step?.moduleId, journeyId: inst?.journeyId });
      return null;
    }

    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    // No child yet — leaf is the parent's "parent.home" step.
    expect(seen.at(-1)).toEqual({ moduleId: "parent", journeyId: "parent" });

    act(() => {
      createTestHarness(runtime).fireExit(rootId, "start");
    });

    // After invoke — the hook returns the child instance, so callers can
    // read `step.moduleId` directly without a separate `getInstance(leafId)`.
    expect(seen.at(-1)).toEqual({ moduleId: "child", journeyId: "child" });
  });
});
