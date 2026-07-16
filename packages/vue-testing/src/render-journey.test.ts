// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { h, type FunctionalComponent } from "vue";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineJourney } from "@modular-vue/journeys";
import { renderJourney } from "./render-journey.js";

// Vue analog of `react-router-testing/src/render-journey.test.tsx`. Entry
// components are functional components (plain functions) so they satisfy the
// runtime's function-component check; `.props` declares the `{ input, exit }`
// the outlet binds.

const exits = { confirmed: defineExit() } as const;

const Confirm: FunctionalComponent<{ input: { note: string }; exit: (n: string) => void }> = (
  props,
) =>
  h("button", { "data-testid": "confirm", onClick: () => props.exit("confirmed") }, "confirm-it");
Confirm.props = ["input", "exit", "goBack"];

const mod = defineModule({
  id: "x",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    confirm: defineEntry({ component: Confirm as never, input: schema<{ note: string }>() }),
  },
});

const journey = defineJourney<{ readonly x: typeof mod }, { note: string }>()({
  id: "j",
  version: "1.0.0",
  initialState: (input: { note: string }) => ({ note: input.note }),
  start: (s) => ({ module: "x", entry: "confirm", input: { note: s.note } }),
  transitions: {
    x: { confirm: { confirmed: () => ({ complete: { ok: true } }) } },
  },
});

describe("renderJourney", () => {
  it("mounts the outlet, drives a transition, and reaches the terminal", async () => {
    const { runtime, instanceId, wrapper } = renderJourney(journey, {
      modules: [mod],
      input: { note: "hi" },
      deps: {},
    });
    expect(runtime.getInstance(instanceId)?.status).toBe("active");

    await wrapper.get('[data-testid="confirm"]').trigger("click");
    await flushPromises();

    expect(runtime.getInstance(instanceId)?.status).toBe("completed");
  });

  it("forwards the terminal outcome to onFinished", async () => {
    const onFinished = vi.fn();
    const { wrapper } = renderJourney(journey, {
      modules: [mod],
      input: { note: "hi" },
      deps: {},
      onFinished,
    });

    await wrapper.get('[data-testid="confirm"]').trigger("click");
    await flushPromises();

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0][0]).toMatchObject({
      status: "completed",
      payload: { ok: true },
      journeyId: "j",
    });
  });
});
