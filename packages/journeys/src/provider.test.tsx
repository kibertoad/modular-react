import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";

import { defineJourney } from "./define-journey.js";
import { createJourneyRuntime } from "./runtime.js";
import { JourneyOutlet } from "./outlet.js";
import { ModuleTab } from "./module-tab.js";
import { JourneyProvider } from "./provider.js";

afterEach(() => {
  cleanup();
});

const exits = { confirmed: defineExit<{ id: string }>() } as const;

function Review({
  input,
  exit,
}: ModuleEntryProps<{ customerId: string }, typeof exits>) {
  return (
    <div>
      <span data-testid="cid">{input.customerId}</span>
      <button
        onClick={() => {
          exit("confirmed", { id: input.customerId });
        }}
      >
        confirm
      </button>
    </div>
  );
}

const mod = defineModule({
  id: "review",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    review: defineEntry({
      component: Review,
      input: schema<{ customerId: string }>(),
    }),
  },
});

type Modules = { readonly review: typeof mod };

const journey = defineJourney<Modules, { customerId: string }>()({
  id: "j",
  version: "1.0.0",
  initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
  start: (s) => ({ module: "review", entry: "review", input: { customerId: s.customerId } }),
  transitions: {
    review: {
      review: {
        confirmed: () => ({ complete: { ok: true } }),
      },
    },
  },
});

describe("JourneyProvider", () => {
  it("lets JourneyOutlet resolve runtime + modules from context without threading props", () => {
    const runtime = createJourneyRuntime(
      [{ definition: journey, options: undefined }],
      { modules: { review: mod }, debug: false },
    );
    const instanceId = runtime.start("j", { customerId: "CTX-1" });
    const { getByTestId } = render(
      <JourneyProvider runtime={runtime}>
        <JourneyOutlet instanceId={instanceId} />
      </JourneyProvider>,
    );
    // The outlet pulled both `runtime` and `modules` from context.
    expect(getByTestId("cid").textContent).toBe("CTX-1");
  });

  it("forwards module exits to the provider-level onModuleExit after the per-tab onExit runs", () => {
    const runtime = createJourneyRuntime([], { modules: { review: mod }, debug: false });
    const globalOnExit = vi.fn();
    const localOnExit = vi.fn();
    const { getByText } = render(
      <JourneyProvider runtime={runtime} onModuleExit={globalOnExit}>
        <ModuleTab
          module={mod}
          entry="review"
          input={{ customerId: "CTX-MT" }}
          tabId="t-ctx"
          onExit={localOnExit}
        />
      </JourneyProvider>,
    );
    act(() => {
      getByText("confirm").click();
    });
    const event = {
      moduleId: "review",
      entry: "review",
      exit: "confirmed",
      output: { id: "CTX-MT" },
      tabId: "t-ctx",
    };
    expect(localOnExit).toHaveBeenCalledWith(event);
    expect(globalOnExit).toHaveBeenCalledWith(event);
    // Both hooks fire for every exit — useful for shells that want a global
    // telemetry hook without dropping per-tab handling.
    expect(globalOnExit).toHaveBeenCalledAfter(localOnExit);
  });

  it("explicit prop runtime still wins over the provider's runtime", () => {
    const providerRuntime = createJourneyRuntime([], {
      modules: { review: mod },
      debug: false,
    });
    const realRuntime = createJourneyRuntime(
      [{ definition: journey, options: undefined }],
      { modules: { review: mod }, debug: false },
    );
    const instanceId = realRuntime.start("j", { customerId: "CTX-2" });
    const { getByTestId } = render(
      <JourneyProvider runtime={providerRuntime}>
        <JourneyOutlet runtime={realRuntime} instanceId={instanceId} />
      </JourneyProvider>,
    );
    expect(getByTestId("cid").textContent).toBe("CTX-2");
  });

  it("throws when no runtime is provided via either prop or context", () => {
    // Error boundary catches the throw so the test can assert on it cleanly.
    const restore = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<JourneyOutlet instanceId="x" />)).toThrow(
      /needs a runtime/,
    );
    restore.mockRestore();
  });
});
