import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";
import { ModuleTab } from "./module-tab.js";

afterEach(() => {
  cleanup();
});

const exits = { confirmed: defineExit<{ id: string }>(), cancelled: defineExit() } as const;

function Review({ input, exit }: ModuleEntryProps<{ customerId: string }, typeof exits>) {
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
      <ModuleTab
        module={mod}
        entry="review"
        input={{ customerId: "C-1" }}
        tabId="t1"
        onExit={onExit}
      />,
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

  it("renders a disambiguation notice when the entry prop is omitted on a multi-entry module", () => {
    const multiMod = defineModule({
      id: "multi",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        review: defineEntry({
          component: Review,
          input: schema<{ customerId: string }>(),
        }),
        other: defineEntry({
          component: Review,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const { getByText } = render(<ModuleTab module={multiMod} />);
    // No `entry` prop was passed and the module has two — the notice asks
    // the caller to disambiguate instead of silently picking one.
    expect(getByText(/exposes multiple entries/)).toBeTruthy();
    expect(getByText(/review, other/)).toBeTruthy();
  });

  it("renders an error notice when the entry prop names an unknown entry", () => {
    const { getByText } = render(
      <ModuleTab module={mod} entry="ghost" input={{ customerId: "C-miss" }} />,
    );
    expect(getByText(/no entry "ghost"/)).toBeTruthy();
    expect(getByText(/review/)).toBeTruthy();
  });

  it("surfaces a notice instead of the legacy component when entry is passed to a module with no entry points", () => {
    const Legacy = () => <div data-testid="legacy-marker">legacy</div>;
    const legacyMod = defineModule({
      id: "legacy-only",
      version: "1.0.0",
      component: Legacy,
    });
    const { getByText, queryByTestId } = render(
      <ModuleTab module={legacyMod} entry="review" input={{ tag: "hi" }} />,
    );
    // An explicit `entry` prop is an opt-in to the entry contract; silently
    // falling through to the legacy component would hide the misconfiguration.
    expect(getByText(/has no entry points/)).toBeTruthy();
    expect(queryByTestId("legacy-marker")).toBeNull();
  });
});
