import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import {
  createJourneyRuntime,
  defineJourney,
  defineTransition,
} from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import { JourneyProvider } from "./provider.js";
import { useJourneyProgress, type JourneyProgress } from "./use-journey-progress.js";

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

function mountUnderProvider<T>(
  runtime: ReturnType<typeof createJourneyRuntime>,
  capture: () => T,
): T {
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

describe("useJourneyProgress (vue)", () => {
  it("reports index / total / label and tracks the journey as it advances", async () => {
    const runtime = createJourneyRuntime([{ definition: checkout, options: undefined }]);
    const id = runtime.start(checkout.id, undefined);

    const progress = mountUnderProvider<JourneyProgress>(runtime, () =>
      useJourneyProgress(id, checkout),
    );

    expect(progress.index.value).toBe(0);
    expect(progress.total.value).toBe(3);
    expect(progress.label.value).toBe("Welcome");
    expect(progress.steps.value.map((s) => `${s.module}/${s.entry}`)).toEqual([
      "profile/review",
      "plan/choose",
      "billing/collect",
    ]);

    createTestHarness(runtime).fireExit(id, "done");
    await flushPromises();
    expect(progress.index.value).toBe(1);
    expect(progress.label.value).toBe("Pick a plan");

    createTestHarness(runtime).fireExit(id, "chosen");
    await flushPromises();
    expect(progress.index.value).toBe(2);
    expect(progress.label.value).toBe("Payment");
  });

  it("derives total even before an instance exists", () => {
    let observed!: JourneyProgress;
    const Probe = defineComponent({
      setup() {
        observed = useJourneyProgress(null, checkout);
        return () => null;
      },
    });
    mount(Probe);
    expect(observed.index.value).toBe(0);
    expect(observed.total.value).toBe(3);
    expect(observed.label.value).toBeNull();
  });
});
