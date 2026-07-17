import { act, cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJourneyRuntime,
  createMemoryPersistence,
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

/** A second, distinct journey so a test can rerender the host with a different
 * `handle` and prove the pinned lifecycle input is never re-read. */
const journeyAlt = defineJourney<Modules, Record<string, never>, void, string>()({
  id: "two-step-alt",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { allowBack: true, next: () => ({ complete: "done" }) } },
  },
});

const handleAlt = defineJourneyHandle(journeyAlt);

/** A journey whose `onAbandon` returns a non-terminal `{ next }` — the case a
 * host's forced teardown must still terminate, or the instance leaks. */
const journeyAbandonNext = defineJourney<Modules, Record<string, never>, void, string>()({
  id: "abandon-next",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  onAbandon: () => ({ next: { module: "b", entry: "show", input: undefined } }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { allowBack: true, next: () => ({ complete: "done" }) } },
  },
});

const handleAbandonNext = defineJourneyHandle(journeyAbandonNext);

function setup() {
  return createJourneyRuntime(
    [
      { definition: journey, options: undefined },
      { definition: journeyAlt, options: undefined },
    ],
    {
      modules,
      debug: false,
    },
  );
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

  it("forces a terminal teardown even when onAbandon would keep the instance alive", async () => {
    // `onAbandon` here returns a non-terminal `{ next }`. Without a forced
    // teardown, unmount would advance the instance to `b` and leave it active,
    // and `forget()` — which only drops terminal records — would no-op, leaking
    // the instance and its persistence key. The host forces the teardown
    // terminal, so it ends and is forgotten.
    const runtime = createJourneyRuntime([{ definition: journeyAbandonNext, options: undefined }], {
      modules,
      debug: false,
    });
    const view = render(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handleAbandonNext} />
      </JourneyProvider>,
    );
    const id = runtime.listInstances()[0]!;
    expect(runtime.getInstance(id)?.status).toBe("active");

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(runtime.getInstance(id)).toBeNull();
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
    // Rerender with a *different* handle (and a changed fallback). `handle` and
    // `input` are read once at mount, so neither the swap nor the fallback
    // change may restart the flow — if either value leaked into the lifecycle
    // effect's dependencies, the "two-step-alt" journey would start here.
    view.rerender(
      <JourneyProvider runtime={runtime}>
        <JourneyHost handle={handleAlt} loadingFallback={<span>two</span>}>
          {({ instanceId, outlet }) => {
            seen.push(instanceId);
            return outlet;
          }}
        </JourneyHost>
      </JourneyProvider>,
    );

    // Same instance throughout, still the original "two-step" journey, and
    // still on the step the user reached — a prop change must never abandon a
    // half-finished flow.
    expect(new Set(seen)).toHaveLength(1);
    expect(runtime.listInstances()).toHaveLength(1);
    expect(runtime.getInstance(seen[0]!)?.journeyId).toBe("two-step");
    expect(screen.getByText("step-b")).toBeDefined();
  });

  it("does not tear down an instance a same-tick replacement host has resumed", async () => {
    // Persistence makes `start()` return the same id for the same input, so a
    // route change that swaps one host for another lands both on the same
    // instance. The outgoing host's deferred end+forget must not fire against
    // the instance the incoming host is now presenting.
    const persistence = createMemoryPersistence<void, Record<string, never>>({
      keyFor: ({ journeyId }) => journeyId,
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: { persistence } }], {
      modules,
      debug: false,
    });

    function App({ which }: { which: "a" | "b" }) {
      return (
        <JourneyProvider runtime={runtime}>
          {which === "a" ? (
            <JourneyHost key="a" handle={handle} />
          ) : (
            <JourneyHost key="b" handle={handle} />
          )}
        </JourneyProvider>
      );
    }

    const view = render(<App which="a" />);
    await act(async () => {
      await Promise.resolve();
    });
    const id = runtime.listInstances()[0]!;
    expect(runtime.getInstance(id)?.status).toBe("active");

    // Different `key`: the "a" host unmounts and the "b" host mounts in the
    // same commit, and persistence hands the same instance across.
    view.rerender(<App which="b" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(runtime.getInstance(id)?.status).toBe("active");
    expect(runtime.listInstances()).toEqual([id]);
    expect(screen.getByText("step-a")).toBeDefined();
  });

  it("tears down a shared instance only when the last concurrent host unmounts", async () => {
    // Two hosts mounted at once resolve to the same persisted instance. The
    // newer one unmounting first must not end+forget the instance the older is
    // still showing — teardown waits for the last owner.
    const persistence = createMemoryPersistence<void, Record<string, never>>({
      keyFor: ({ journeyId }) => journeyId,
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: { persistence } }], {
      modules,
      debug: false,
    });

    function App({ hosts }: { hosts: 0 | 1 | 2 }) {
      return (
        <JourneyProvider runtime={runtime}>
          {hosts >= 1 ? <JourneyHost key="a" handle={handle} /> : null}
          {hosts >= 2 ? <JourneyHost key="b" handle={handle} /> : null}
        </JourneyProvider>
      );
    }

    const view = render(<App hosts={2} />);
    await act(async () => {
      await Promise.resolve();
    });
    const id = runtime.listInstances()[0]!;
    // Both hosts share the one persisted instance.
    expect(runtime.listInstances()).toEqual([id]);
    expect(runtime.getInstance(id)?.status).toBe("active");

    // Unmount the newer host (b) first — the older host (a) still owns the id.
    view.rerender(<App hosts={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(runtime.getInstance(id)?.status).toBe("active");

    // Unmount the last owner — now it ends and forgets.
    view.rerender(<App hosts={0} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(runtime.getInstance(id)).toBeNull();
  });

  it("pins the runtime it started on, rather than following a swapped one", async () => {
    const runtimeA = setup();
    const runtimeB = setup();
    const view = render(
      <JourneyHost handle={handle} runtime={runtimeA} loadingFallback={<span>loading</span>} />,
    );
    const id = runtimeA.listInstances()[0]!;
    expect(screen.getByText("step-a")).toBeDefined();

    // The instance lives on runtimeA and its id means nothing to runtimeB, so
    // the host stays on the runtime it started against instead of stranding
    // itself against one that has never heard of the instance.
    view.rerender(
      <JourneyHost handle={handle} runtime={runtimeB} loadingFallback={<span>loading</span>} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("step-a")).toBeDefined();
    expect(screen.queryByText("loading")).toBeNull();
    expect(runtimeA.getInstance(id)?.status).toBe("active");
    expect(runtimeB.listInstances()).toHaveLength(0);
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
