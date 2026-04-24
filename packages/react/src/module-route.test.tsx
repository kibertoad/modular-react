import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";

import { ModuleExitProvider } from "./module-exit.js";
import { ModuleRoute } from "./module-route.js";

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

describe("ModuleRoute", () => {
  it("renders the named entry with input and threads exits to the local onExit", () => {
    const onExit = vi.fn();
    const { getByText, getByTestId } = render(
      <ModuleRoute
        module={mod}
        entry="review"
        input={{ customerId: "C-1" }}
        routeId="r1"
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
      tabId: undefined,
      routeId: "r1",
    });
  });

  it("forwards exits to a ModuleExitProvider above it", () => {
    const providerOnExit = vi.fn();
    const { getByText } = render(
      <ModuleExitProvider onExit={providerOnExit}>
        <ModuleRoute module={mod} entry="review" input={{ customerId: "C-2" }} />
      </ModuleExitProvider>,
    );

    act(() => {
      getByText("confirm").click();
    });
    expect(providerOnExit).toHaveBeenCalledTimes(1);
    expect(providerOnExit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: "review",
        entry: "review",
        exit: "confirmed",
        output: { id: "C-2" },
      }),
    );
  });

  it("fires the local onExit prop before the provider dispatcher", () => {
    const order: string[] = [];
    const providerOnExit = vi.fn(() => {
      order.push("provider");
    });
    const localOnExit = vi.fn(() => {
      order.push("local");
    });
    const { getByText } = render(
      <ModuleExitProvider onExit={providerOnExit}>
        <ModuleRoute
          module={mod}
          entry="review"
          input={{ customerId: "C-3" }}
          onExit={localOnExit}
        />
      </ModuleExitProvider>,
    );

    act(() => {
      getByText("cancel").click();
    });
    expect(order).toEqual(["local", "provider"]);
  });

  it("auto-resolves the single entry when `entry` is omitted", () => {
    const { getByTestId } = render(
      <ModuleRoute module={mod} input={{ customerId: "C-auto" }} />,
    );
    expect(getByTestId("cid").textContent).toBe("C-auto");
  });

  it("renders an error notice when the entry prop names an unknown entry", () => {
    const { getByText } = render(
      <ModuleRoute module={mod} entry="ghost" input={{ customerId: "C-miss" }} />,
    );
    expect(getByText(/no entry "ghost"/)).toBeTruthy();
    expect(getByText(/review/)).toBeTruthy();
  });

  it("renders a disambiguation notice when multiple entries exist and `entry` is omitted", () => {
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
    const { getByText } = render(<ModuleRoute module={multiMod} />);
    expect(getByText(/exposes multiple entries/)).toBeTruthy();
    expect(getByText(/review, other/)).toBeTruthy();
  });

  it("surfaces a notice instead of the legacy component when entry is passed to a module with no entry points", () => {
    const Legacy = () => <div data-testid="legacy-marker">legacy</div>;
    const legacyMod = defineModule({
      id: "legacy-only",
      version: "1.0.0",
      component: Legacy,
    });
    const { getByText, queryByTestId } = render(
      <ModuleRoute module={legacyMod} entry="review" input={{ tag: "hi" }} />,
    );
    expect(getByText(/has no entry points/)).toBeTruthy();
    expect(queryByTestId("legacy-marker")).toBeNull();
  });

  it("falls back to module.component when no entry points exist and `entry` is omitted", () => {
    const Legacy = ({ input }: { input?: { tag: string } }) => (
      <div data-testid="legacy">{input?.tag ?? "no-input"}</div>
    );
    const legacyMod = defineModule({
      id: "legacy",
      version: "1.0.0",
      component: Legacy,
    });
    const { getByTestId } = render(<ModuleRoute module={legacyMod} input={{ tag: "hi" }} />);
    expect(getByTestId("legacy").textContent).toBe("hi");
  });

  it("passes a goBack handler through when supplied", () => {
    const goBack = vi.fn();
    function BackAware({
      input,
      goBack: gb,
    }: ModuleEntryProps<{ customerId: string }, typeof exits> & {
      readonly goBack?: () => void;
    }) {
      return (
        <button
          onClick={() => gb?.()}
          data-testid="cid"
          data-cid={input.customerId}
        >
          back
        </button>
      );
    }
    const backMod = defineModule({
      id: "back-aware",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        review: defineEntry({
          component: BackAware as any,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const { getByTestId } = render(
      <ModuleRoute
        module={backMod}
        entry="review"
        input={{ customerId: "C-back" }}
        goBack={goBack}
      />,
    );
    act(() => {
      getByTestId("cid").click();
    });
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it("renders stably under React Strict Mode", () => {
    const onExit = vi.fn();
    const { getByText } = render(
      <StrictMode>
        <ModuleExitProvider onExit={onExit}>
          <ModuleRoute module={mod} entry="review" input={{ customerId: "C-strict" }} />
        </ModuleExitProvider>
      </StrictMode>,
    );
    act(() => {
      getByText("confirm").click();
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
