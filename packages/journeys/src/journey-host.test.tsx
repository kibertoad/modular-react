import { act, cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJourneyRuntime,
  defineJourney,
  defineJourneyHandle,
} from "@modular-frontend/journeys-engine";
import type { InstanceId, ModuleEntryProps } from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import { JourneyHost, useJourneyHost } from "./journey-host.js";
import { JourneyProvider } from "./provider.js";

afterEach(() => {
  cleanup();
});

const exits = { next: defineExit() } as const;

function stepComponent(label: string) {
  return function Step({ exit }: ModuleEntryProps<void, typeof exits>) {
    return (
      <button type="button" onClick={() => exit("next")}>
        {label}
      </button>
    );
  };
}

const modA = defineModule({
  id: "a",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    show: defineEntry({
      component: stepComponent("step-a") as never,
      input: schema<void>(),
      allowBack: "preserve-state",
    }),
  },
});

const modB = defineModule({
  id: "b",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    show: defineEntry({
      component: stepComponent("step-b") as never,
      input: schema<void>(),
      allowBack: "preserve-state",
    }),
  },
});

const modules = { a: modA, b: modB };
type Modules = { readonly a: typeof modA; readonly b: typeof modB };

const journey = defineJourney<Modules, Record<string, never>, void, string>()({
  id: "two-step",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { allowBack: true, next: () => ({ complete: "done" }) } },
  },
});

const handle = defineJourneyHandle(journey);

function setup() {
  return createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules,
    debug: false,
  });
}

describe("<JourneyHost>", () => {
  it("starts the journey on mount and renders its current step", () => {
    const runtime = setup();
    render(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handle} />
      </JourneyProvider>,
    );

    expect(screen.getByText("step-a")).toBeDefined();
    expect(runtime.listInstances()).toHaveLength(1);
  });

  it("advances through the outlet it renders", () => {
    const runtime = setup();
    render(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handle} />
      </JourneyProvider>,
    );

    act(() => {
      screen.getByText("step-a").click();
    });
    expect(screen.getByText("step-b")).toBeDefined();
  });

  it("hands chrome the live step index and a ready-built outlet", () => {
    const runtime = setup();
    render(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handle}>
          {({ stepIndex, outlet }) => (
            <div>
              <span data-testid="progress">{`step ${stepIndex}`}</span>
              {outlet}
            </div>
          )}
        </JourneyHost>
      </JourneyProvider>,
    );

    expect(screen.getByTestId("progress").textContent).toBe("step 0");
    expect(screen.getByText("step-a")).toBeDefined();

    act(() => {
      screen.getByText("step-a").click();
    });
    expect(screen.getByTestId("progress").textContent).toBe("step 1");
  });

  it("ends and forgets the instance on unmount", async () => {
    const runtime = setup();
    let captured: InstanceId | null = null;
    const view = render(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handle}>
          {({ instanceId, outlet }) => {
            captured = instanceId;
            return outlet;
          }}
        </JourneyHost>
      </JourneyProvider>,
    );
    expect(captured).not.toBeNull();

    view.unmount();
    // The teardown is deferred one microtask so StrictMode's remount can
    // cancel it.
    await act(async () => {
      await Promise.resolve();
    });

    // `forget` drops the record outright, which is the half `<JourneyOutlet>`
    // does not do on its own.
    expect(runtime.getInstance(captured!)).toBeNull();
    expect(runtime.listInstances()).toHaveLength(0);
  });

  it("starts exactly one instance under StrictMode, and keeps it", async () => {
    const runtime = setup();
    render(
      <StrictMode>
        <JourneyProvider runtime={runtime}>
          <JourneyHost handle={handle} />
        </JourneyProvider>
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    // The mount/unmount/mount dance must neither mint a second instance nor
    // tear the first one down on its first visit.
    expect(runtime.listInstances()).toHaveLength(1);
    const id = runtime.listInstances()[0]!;
    expect(runtime.getInstance(id)?.status).toBe("active");
    expect(screen.getByText("step-a")).toBeDefined();
  });

  it("keeps the same instance when props change, rather than restarting the flow", () => {
    const runtime = setup();
    const seen: (InstanceId | null)[] = [];
    const view = render(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handle} loadingFallback={<span>one</span>}>
          {({ instanceId, outlet }) => {
            seen.push(instanceId);
            return outlet;
          }}
        </JourneyHost>
      </JourneyProvider>,
    );
    act(() => {
      screen.getByText("step-a").click();
    });
    view.rerender(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handle} loadingFallback={<span>two</span>}>
          {({ instanceId, outlet }) => {
            seen.push(instanceId);
            return outlet;
          }}
        </JourneyHost>
      </JourneyProvider>,
    );

    // Same instance throughout, and still on the step the user reached —
    // a prop identity change must never abandon a half-finished flow.
    expect(new Set(seen)).toHaveLength(1);
    expect(runtime.listInstances()).toHaveLength(1);
    expect(screen.getByText("step-b")).toBeDefined();
  });

  it("forwards outlet props", () => {
    const runtime = setup();
    const onFinished = vi.fn();
    render(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handle} onFinished={onFinished} />
      </JourneyProvider>,
    );

    act(() => {
      screen.getByText("step-a").click();
    });
    act(() => {
      screen.getByText("step-b").click();
    });

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]).toMatchObject({ status: "completed", payload: "done" });
  });

  it("throws a directed error when there is no runtime", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<JourneyHost handle={handle} />)).toThrow(/needs a runtime/);
    spy.mockRestore();
  });

  it("takes an explicit runtime prop over the provider's", () => {
    const contextRuntime = setup();
    const ownRuntime = setup();
    render(
      <JourneyProvider runtime={contextRuntime}>
        <JourneyHost handle={handle} runtime={ownRuntime} />
      </JourneyProvider>,
    );

    expect(ownRuntime.listInstances()).toHaveLength(1);
    expect(contextRuntime.listInstances()).toHaveLength(0);
  });
});

describe("useJourneyHost", () => {
  it("reports no instance on the first render, then the started one", () => {
    const runtime = setup();
    const frames: (InstanceId | null)[] = [];

    function Probe() {
      const { instanceId } = useJourneyHost(handle, undefined);
      frames.push(instanceId);
      return null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    // The journey is started from an effect — starting it during render would
    // mutate the runtime from a render React is free to discard or replay —
    // so the first render genuinely has no instance. `<JourneyHost>` renders
    // `loadingFallback` for exactly this frame.
    expect(frames[0]).toBeNull();
    expect(frames.at(-1)).not.toBeNull();
    expect(runtime.listInstances()).toEqual([frames.at(-1)]);
  });

  it("tracks the step index as the journey advances and rewinds", () => {
    const runtime = setup();
    let latest = -1;

    function Probe() {
      const { instanceId, stepIndex } = useJourneyHost(handle, undefined);
      latest = stepIndex;
      return instanceId ? <span data-testid="id">{instanceId}</span> : null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );
    expect(latest).toBe(0);

    const id = runtime.listInstances()[0]!;
    act(() => {
      createTestHarness(runtime).fireExit(id, "next");
    });
    expect(latest).toBe(1);

    act(() => {
      runtime.goBack(id);
    });
    expect(latest).toBe(0);
  });
});
