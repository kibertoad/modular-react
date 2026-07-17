import { act, cleanup, render } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJourneyRuntime,
  createMemoryJourneySyncPort,
} from "@modular-frontend/journeys-engine";
import type { InstanceId, JourneySyncPort } from "@modular-frontend/journeys-engine";
import { defineJourney } from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import { JourneyProvider } from "./provider.js";
import { useJourneySync } from "./use-journey-sync.js";

afterEach(() => {
  cleanup();
});

const exits = { next: defineExit() } as const;

function stepModule(id: string) {
  return defineModule({
    id,
    version: "1.0.0",
    exitPoints: exits,
    entryPoints: {
      show: defineEntry({
        component: (() => null) as never,
        input: schema<void>(),
        allowBack: "preserve-state",
      }),
    },
  });
}

const modA = stepModule("a");
const modB = stepModule("b");
const modules = { a: modA, b: modB };

type Modules = { readonly a: typeof modA; readonly b: typeof modB };

const journey = defineJourney<Modules, Record<string, never>>()({
  id: "two-step",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { allowBack: true, next: () => ({ complete: undefined }) } },
  },
});

function setup() {
  const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], { modules });
  const id = runtime.start(journey.id, undefined);
  return { runtime, id, harness: createTestHarness(runtime) };
}

describe("useJourneySync", () => {
  it("stamps the current step onto the URL on mount", () => {
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort("/checkout");

    function Probe() {
      useJourneySync(id, port);
      return null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    expect(port.read()).toBe("a/show");
  });

  it("follows the journey forward and lets the location drive it back", () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();

    function Probe() {
      useJourneySync(id, port);
      return null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    act(() => {
      harness.fireExit(id, "next");
    });
    expect(port.read()).toBe("b/show");
    expect(port.entries).toEqual(["a/show", "b/show"]);

    act(() => {
      port.go(-1);
    });
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");
  });

  it("reads the runtime from an explicit option over the provider", () => {
    const { runtime: contextRuntime } = setup();
    const { runtime: ownRuntime, id: ownId, harness } = setup();
    const port = createMemoryJourneySyncPort();

    function Probe() {
      useJourneySync(ownId, port, { runtime: ownRuntime });
      return null;
    }
    render(
      <JourneyProvider runtime={contextRuntime}>
        <Probe />
      </JourneyProvider>,
    );

    act(() => {
      harness.fireExit(ownId, "next");
    });
    // Synced against the option's runtime, not the provider's.
    expect(port.read()).toBe("b/show");
  });

  it("no-ops for a null instance id so it can be called before the instance exists", () => {
    const { runtime } = setup();
    const port = createMemoryJourneySyncPort("/checkout");

    function Probe() {
      useJourneySync(null, port);
      return null;
    }
    expect(() =>
      render(
        <JourneyProvider runtime={runtime}>
          <Probe />
        </JourneyProvider>,
      ),
    ).not.toThrow();
    expect(port.read()).toBe("/checkout");
  });

  it("does not re-navigate when a re-render passes a fresh port object", () => {
    const { runtime, id } = setup();
    const base = createMemoryJourneySyncPort();
    const replace = vi.fn(base.replace);
    let renders = 0;

    function Probe({ tick }: { tick: number }) {
      renders += 1;
      // A port literal rebuilt on every render — the common shape, and the
      // one that would thrash if the hook put `port` in its effect deps.
      useJourneySync(id, {
        read: base.read,
        push: base.push,
        replace,
        go: base.go,
        subscribe: base.subscribe,
      });
      return <span>{tick}</span>;
    }

    const view = render(
      <JourneyProvider runtime={runtime}>
        <Probe tick={1} />
      </JourneyProvider>,
    );
    view.rerender(
      <JourneyProvider runtime={runtime}>
        <Probe tick={2} />
      </JourneyProvider>,
    );
    view.rerender(
      <JourneyProvider runtime={runtime}>
        <Probe tick={3} />
      </JourneyProvider>,
    );

    expect(renders).toBe(3);
    // The initial stamp, and nothing more: re-creating the sync would re-run
    // its initial reconcile, and that reconcile navigates.
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callbacks without needing them memoized", () => {
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort();
    const first = vi.fn();
    const second = vi.fn();

    function Probe({ onUnresolved }: { onUnresolved: () => void }) {
      useJourneySync(id, port, { onUnresolved });
      return null;
    }

    const view = render(
      <JourneyProvider runtime={runtime}>
        <Probe onUnresolved={first} />
      </JourneyProvider>,
    );
    view.rerender(
      <JourneyProvider runtime={runtime}>
        <Probe onUnresolved={second} />
      </JourneyProvider>,
    );

    act(() => {
      port.push("/settings");
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("has the newest callback in place before a same-commit layout effect can navigate", () => {
    // The latest-value refs must be updated in the layout phase, not a passive
    // one. A passive effect runs after paint, leaving a window in which a
    // *layout* effect elsewhere in the same commit — a router navigating from
    // `useLayoutEffect` — drives the live subscription while the refs still
    // hold the previous render's callbacks, firing the stale one. Reproduce
    // exactly that: rerender with a new `onUnresolved`, and in the same commit
    // push an out-of-flow location from a layout effect that is declared after
    // the hook (so it runs after the hook's own ref-updating layout effect).
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort();
    const first = vi.fn();
    const second = vi.fn();

    function Probe({ onUnresolved, navigate }: { onUnresolved: () => void; navigate: boolean }) {
      useJourneySync(id, port, { onUnresolved });
      useLayoutEffect(() => {
        if (navigate) port.push("/settings");
      }, [navigate]);
      return null;
    }

    const view = render(
      <JourneyProvider runtime={runtime}>
        <Probe onUnresolved={first} navigate={false} />
      </JourneyProvider>,
    );
    view.rerender(
      <JourneyProvider runtime={runtime}>
        <Probe onUnresolved={second} navigate={true} />
      </JourneyProvider>,
    );

    // With a passive ref write, `first` fires here — the layout-effect push
    // beat the ref update. The layout-phase write closes that window.
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("has the newest callback in place before a descendant's layout effect can navigate", () => {
    // The same hazard as the test above, but from a *descendant*. React runs a
    // child's layout effects before its parent's, so a ref write in the hook's
    // own `useLayoutEffect` runs too late: a child that navigates from its
    // layout effect drives the live subscription while the parent hook's refs
    // still hold the previous render's callbacks, firing the stale one. Closing
    // this needs the refs published before *any* layout effect in the tree — an
    // insertion effect, which the whole tree flushes before the layout phase.
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort();
    const first = vi.fn();
    const second = vi.fn();

    function Navigator({ navigate }: { navigate: boolean }) {
      useLayoutEffect(() => {
        if (navigate) port.push("/settings");
      }, [navigate]);
      return null;
    }

    function Probe({ onUnresolved, navigate }: { onUnresolved: () => void; navigate: boolean }) {
      useJourneySync(id, port, { onUnresolved });
      return <Navigator navigate={navigate} />;
    }

    const view = render(
      <JourneyProvider runtime={runtime}>
        <Probe onUnresolved={first} navigate={false} />
      </JourneyProvider>,
    );
    view.rerender(
      <JourneyProvider runtime={runtime}>
        <Probe onUnresolved={second} navigate={true} />
      </JourneyProvider>,
    );

    // The descendant's layout push must see the newest callback, not the stale
    // one — the parent hook's refs are published in the insertion phase, ahead
    // of the child's layout effect.
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("honours a port that cannot navigate relatively", () => {
    const { runtime, id, harness } = setup();
    const base = createMemoryJourneySyncPort();
    // No `go`. The proxy the hook installs must present that absence
    // faithfully, or the reconciler would call a no-op instead of falling
    // back to `replace` and the URL would go stale.
    const port: JourneySyncPort = {
      read: base.read,
      push: base.push,
      replace: base.replace,
      subscribe: base.subscribe,
    };

    function Probe() {
      useJourneySync(id, port);
      return null;
    }
    render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );

    act(() => {
      harness.fireExit(id, "next");
    });
    act(() => {
      runtime.goBack(id);
    });

    expect(port.read()).toBe("a/show");
    expect(base.entries).toEqual(["a/show", "a/show"]);
  });

  it("stops syncing once unmounted", () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();

    function Probe() {
      useJourneySync(id, port);
      return null;
    }
    const view = render(
      <JourneyProvider runtime={runtime}>
        <Probe />
      </JourneyProvider>,
    );
    view.unmount();

    act(() => {
      harness.fireExit(id, "next");
    });
    expect(port.read()).toBe("a/show");
  });

  it("settles to one stamp under StrictMode's double-invoked effects", () => {
    const { runtime, id } = setup();
    const base = createMemoryJourneySyncPort("/checkout");
    const replace = vi.fn(base.replace);
    const push = vi.fn(base.push);
    const port: JourneySyncPort = { ...base, read: base.read, replace, push };

    function Probe() {
      useJourneySync(id, port);
      return null;
    }
    render(
      <StrictMode>
        <JourneyProvider runtime={runtime}>
          <Probe />
        </JourneyProvider>
      </StrictMode>,
    );

    expect(base.read()).toBe("a/show");
    // The remount's reconcile finds the URL already correct and writes
    // nothing; either way the stack must not grow.
    expect(push).not.toHaveBeenCalled();
    expect(base.entries).toEqual(["a/show"]);
  });

  it("tolerates an unknown instance id", () => {
    const { runtime } = setup();
    const port = createMemoryJourneySyncPort("/checkout");

    function Probe() {
      useJourneySync("nope" as InstanceId, port);
      return null;
    }
    expect(() =>
      render(
        <JourneyProvider runtime={runtime}>
          <Probe />
        </JourneyProvider>,
      ),
    ).not.toThrow();
  });
});
