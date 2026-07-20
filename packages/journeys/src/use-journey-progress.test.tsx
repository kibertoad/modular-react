import { act, cleanup, render } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  createJourneyRuntime,
  defineJourney,
  defineTransition,
} from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import { JourneyProvider } from "./provider.js";
import { useJourneyProgress, type JourneyProgress } from "./use-journey-progress.js";

afterEach(() => {
  cleanup();
});

const profile = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: { done: defineExit() },
  entryPoints: {
    review: defineEntry({ component: (() => null) as never, input: schema<void>() }),
  },
});
const plan = defineModule({
  id: "plan",
  version: "1.0.0",
  exitPoints: { chosen: defineExit() },
  entryPoints: {
    choose: defineEntry({ component: (() => null) as never, input: schema<void>() }),
  },
});
const billing = defineModule({
  id: "billing",
  version: "1.0.0",
  exitPoints: { paid: defineExit() },
  entryPoints: {
    collect: defineEntry({ component: (() => null) as never, input: schema<void>() }),
  },
});

type Modules = {
  readonly profile: typeof profile;
  readonly plan: typeof plan;
  readonly billing: typeof billing;
};
interface State {
  readonly ok: boolean;
}

const transition = defineTransition<Modules, State>();

const checkout = defineJourney<Modules, State>()({
  id: "checkout",
  version: "1.0.0",
  initialState: () => ({ ok: true }),
  start: () => ({ module: "profile", entry: "review", input: undefined }),
  steps: {
    profile: { review: { progressLabel: "Welcome" } },
    plan: { choose: { progressLabel: "Pick a plan" } },
    billing: { collect: { progressLabel: "Payment" } },
  },
  transitions: {
    profile: {
      review: {
        done: transition({
          targets: [{ module: "plan", entry: "choose" }],
          handle: () => ({ next: { module: "plan", entry: "choose", input: undefined } }),
        }),
      },
    },
    plan: {
      choose: {
        chosen: transition({
          targets: [{ module: "billing", entry: "collect" }],
          handle: () => ({ next: { module: "billing", entry: "collect", input: undefined } }),
        }),
      },
    },
    billing: {
      collect: {
        paid: transition({ targets: ["complete"], handle: () => ({ complete: undefined }) }),
      },
    },
  },
});

describe("useJourneyProgress", () => {
  it("reports index / total / label and advances as the journey does", () => {
    const runtime = createJourneyRuntime([{ definition: checkout, options: undefined }]);
    const id = runtime.start(checkout.id, undefined);
    const seen: JourneyProgress[] = [];

    function Probe() {
      seen.push(useJourneyProgress(id, checkout));
      return null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    expect(seen.at(-1)).toMatchObject({ index: 0, total: 3, label: "Welcome" });
    expect(seen.at(-1)?.steps.map((s) => `${s.module}/${s.entry}`)).toEqual([
      "profile/review",
      "plan/choose",
      "billing/collect",
    ]);

    act(() => {
      createTestHarness(runtime).fireExit(id, "done");
    });
    expect(seen.at(-1)).toMatchObject({ index: 1, total: 3, label: "Pick a plan" });

    act(() => {
      createTestHarness(runtime).fireExit(id, "chosen");
    });
    expect(seen.at(-1)).toMatchObject({ index: 2, total: 3, label: "Payment" });
  });

  it("keeps index correct under a maxHistory cap that trims history", () => {
    // maxHistory: 1 trims `history` to a single frame, so `history.length`
    // would stall at 1 on the third step. `index` is derived from the resolved
    // spine instead, so it still reports the true position.
    const runtime = createJourneyRuntime([{ definition: checkout, options: { maxHistory: 1 } }]);
    const id = runtime.start(checkout.id, undefined);
    const seen: JourneyProgress[] = [];

    function Probe() {
      seen.push(useJourneyProgress(id, checkout));
      return null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    act(() => {
      createTestHarness(runtime).fireExit(id, "done");
    });
    act(() => {
      createTestHarness(runtime).fireExit(id, "chosen");
    });

    // History has been trimmed to length 1, but the current step is
    // billing/collect — position 2 in the spine.
    expect(runtime.getInstance(id)?.history.length).toBe(1);
    expect(seen.at(-1)).toMatchObject({ index: 2, total: 3, label: "Payment" });
  });

  it("derives total even before an instance exists (index 0, label null)", () => {
    let observed: JourneyProgress | undefined;
    function Probe() {
      observed = useJourneyProgress(null, checkout);
      return null;
    }
    render(<Probe />);
    expect(observed).toMatchObject({ index: 0, total: 3, label: null });
  });

  it("returns total null when the flow's transitions are bare (unwalkable)", () => {
    const bare = defineJourney<Modules, State>()({
      id: "bare",
      version: "1.0.0",
      initialState: () => ({ ok: true }),
      start: () => ({ module: "profile", entry: "review", input: undefined }),
      transitions: {
        profile: {
          review: { done: () => ({ next: { module: "plan", entry: "choose", input: undefined } }) },
        },
      },
    });
    const runtime = createJourneyRuntime([{ definition: bare, options: undefined }]);
    const id = runtime.start(bare.id, undefined);
    let observed: JourneyProgress | undefined;
    function Probe() {
      observed = useJourneyProgress(id, bare);
      return null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );
    // The walk stops at the bare-handler start step without reaching a genuine
    // terminal, so the spine is partial and `total` is null rather than the
    // misleading lower bound of 1. `steps` still carries the one known step.
    expect(observed?.total).toBeNull();
    expect(observed?.steps.map((s) => `${s.module}/${s.entry}`)).toEqual(["profile/review"]);
  });
});
