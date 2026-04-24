// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";
import { defineJourney } from "@modular-react/journeys";
import { renderJourney } from "./render-journey.js";

afterEach(() => {
  cleanup();
});

const exits = { confirmed: defineExit() } as const;

function Confirm({ exit }: ModuleEntryProps<{ note: string }, typeof exits>) {
  return (
    <button
      onClick={() => {
        exit("confirmed");
      }}
    >
      confirm-it
    </button>
  );
}

const mod = defineModule({
  id: "x",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    confirm: defineEntry({ component: Confirm, input: schema<{ note: string }>() }),
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
  it("mounts the outlet, drives a transition, and reaches the terminal", () => {
    const { runtime, instanceId, getByText } = renderJourney(journey, {
      modules: [mod],
      input: { note: "hi" },
      deps: {},
    });
    expect(runtime.getInstance(instanceId)?.status).toBe("active");
    act(() => {
      getByText("confirm-it").click();
    });
    expect(runtime.getInstance(instanceId)?.status).toBe("completed");
  });
});
