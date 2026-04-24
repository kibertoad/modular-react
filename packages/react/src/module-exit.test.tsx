import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModuleExitProvider, useModuleExit, useModuleExitDispatcher } from "./module-exit.js";

afterEach(() => {
  cleanup();
});

function Trigger(props: {
  readonly moduleId: string;
  readonly entry: string;
  readonly exitName: string;
  readonly output?: unknown;
  readonly tabId?: string;
  readonly localOnExit?: (event: import("./module-exit.js").ModuleExitEvent) => void;
}) {
  const { moduleId, entry, exitName, output, tabId, localOnExit } = props;
  const exit = useModuleExit(moduleId, entry, { tabId, localOnExit });
  return (
    <button
      onClick={() => {
        exit(exitName as never, output as never);
      }}
    >
      fire
    </button>
  );
}

describe("ModuleExitProvider / useModuleExit", () => {
  it("delivers exits to the provider-level dispatcher", () => {
    const onExit = vi.fn();
    const { getByText } = render(
      <ModuleExitProvider onExit={onExit}>
        <Trigger moduleId="m1" entry="default" exitName="confirmed" output={{ id: 7 }} />
      </ModuleExitProvider>,
    );
    fireEvent.click(getByText("fire"));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith({
      moduleId: "m1",
      entry: "default",
      exit: "confirmed",
      output: { id: 7 },
      tabId: undefined,
    });
  });

  it("fires the local onExit before the provider dispatcher", () => {
    const order: string[] = [];
    const globalOnExit = vi.fn(() => {
      order.push("global");
    });
    const localOnExit = vi.fn(() => {
      order.push("local");
    });
    const { getByText } = render(
      <ModuleExitProvider onExit={globalOnExit}>
        <Trigger moduleId="m1" entry="default" exitName="cancelled" localOnExit={localOnExit} />
      </ModuleExitProvider>,
    );
    fireEvent.click(getByText("fire"));
    expect(order).toEqual(["local", "global"]);
    expect(localOnExit).toHaveBeenCalledTimes(1);
    expect(globalOnExit).toHaveBeenCalledTimes(1);
  });

  it("threads tabId through the event when provided", () => {
    const onExit = vi.fn();
    const { getByText } = render(
      <ModuleExitProvider onExit={onExit}>
        <Trigger moduleId="m1" entry="default" exitName="done" tabId="tab-42" />
      </ModuleExitProvider>,
    );
    fireEvent.click(getByText("fire"));
    expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ tabId: "tab-42" }));
  });

  it("is a safe no-op when no provider is mounted", () => {
    const { getByText } = render(<Trigger moduleId="m1" entry="default" exitName="done" />);
    expect(() => fireEvent.click(getByText("fire"))).not.toThrow();
  });

  it("useModuleExitDispatcher returns undefined without a provider", () => {
    let seen: unknown = "unchanged";
    function Reader() {
      seen = useModuleExitDispatcher();
      return null;
    }
    render(<Reader />);
    expect(seen).toBeUndefined();
  });

  it("useModuleExitDispatcher exposes the registered handler", () => {
    const onExit = vi.fn();
    let seen: unknown = null;
    function Reader() {
      seen = useModuleExitDispatcher();
      return null;
    }
    render(
      <ModuleExitProvider onExit={onExit}>
        <Reader />
      </ModuleExitProvider>,
    );
    expect(seen).toBe(onExit);
  });
});
