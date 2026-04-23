import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";
import { ModuleTab } from "./module-tab.js";

afterEach(() => {
  cleanup();
});

const exits = { confirmed: defineExit<{ id: string }>(), cancelled: defineExit() } as const;

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
      <button
        onClick={() => {
          exit("cancelled");
        }}
      >
        cancel
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

describe("ModuleTab", () => {
  it("renders the named entry with input and threads exits to onExit", () => {
    const onExit = vi.fn();
    const { getByText, getByTestId } = render(
      <ModuleTab module={mod} entry="review" input={{ customerId: "C-1" }} tabId="t1" onExit={onExit} />,
    );
    expect(getByTestId("cid").textContent).toBe("C-1");

    act(() => {
      getByText("confirm").click();
    });
    expect(onExit).toHaveBeenCalledWith({
      moduleId: "review",
      entry: "review",
      exit: "confirmed",
      output: { id: "C-1" },
      tabId: "t1",
    });
  });

  it("falls back to module.component when no entry matches", () => {
    const Legacy = ({ input }: { input?: { tag: string } }) => (
      <div data-testid="legacy">{input?.tag ?? "no-input"}</div>
    );
    const legacyMod = defineModule({
      id: "legacy",
      version: "1.0.0",
      component: Legacy,
    });
    const { getByTestId } = render(<ModuleTab module={legacyMod} input={{ tag: "hi" }} />);
    expect(getByTestId("legacy").textContent).toBe("hi");
  });
});
