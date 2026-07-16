import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { describe, expect, it, vi } from "vitest";

import { defineJourney } from "./define-journey.js";
import {
  createJourneySync,
  createMemoryJourneySyncPort,
  defaultStepPath,
  journeyStepPath,
  resolveJourneySyncAction,
} from "./journey-sync.js";
import type { JourneySyncPort } from "./journey-sync.js";
import { createJourneyRuntime } from "./runtime.js";
import { createTestHarness } from "./testing.js";
import type { InstanceId } from "./types.js";

const exits = {
  next: defineExit(),
  again: defineExit(),
} as const;

/** Three interchangeable single-entry modules — `a/show`, `b/show`, `c/show`. */
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
const modC = stepModule("c");

type Modules = { readonly a: typeof modA; readonly b: typeof modB; readonly c: typeof modC };

const modules = { a: modA, b: modB, c: modC };

/**
 * a -> b -> c -> complete. `b` and `c` opt into back navigation, so every
 * frame is reachable by a rewind; `a` never needs to (nothing leaves it
 * backwards).
 */
const linear = defineJourney<Modules, Record<string, never>>()({
  id: "linear",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: {
      show: {
        allowBack: true,
        next: () => ({ next: { module: "c", entry: "show", input: undefined } }),
      },
    },
    c: { show: { allowBack: true, next: () => ({ complete: undefined }) } },
  },
});

/** a -> b, with no `allowBack` anywhere: every rewind is refused. */
const locked = defineJourney<Modules, Record<string, never>>()({
  id: "locked",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { next: () => ({ complete: undefined }) } },
  },
});

/** a -> b -> (again) -> a -> b, so the same path occupies two history frames. */
const loop = defineJourney<Modules, Record<string, never>>()({
  id: "loop",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: {
      show: {
        allowBack: true,
        again: () => ({ next: { module: "a", entry: "show", input: undefined } }),
        next: () => ({ complete: undefined }),
      },
    },
  },
});

function setup(definition = linear) {
  const runtime = createJourneyRuntime([{ definition, options: undefined }], { modules });
  const id = runtime.start(definition.id, undefined);
  const harness = createTestHarness(runtime);
  const instance = () => runtime.getInstance(id)!;
  return { runtime, id, harness, instance };
}

describe("defaultStepPath", () => {
  it("renders a step as `moduleId/entry`", () => {
    expect(defaultStepPath({ moduleId: "a", entry: "show", input: undefined })).toBe("a/show");
  });
});

describe("journeyStepPath", () => {
  it("returns the current step's path for an active journey", () => {
    const { instance } = setup();
    expect(journeyStepPath(instance())).toBe("a/show");
  });

  it("returns null once the journey is terminal, so the sync leaves the URL alone", () => {
    const { id, harness, instance } = setup();
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    expect(instance().status).toBe("completed");
    // A completed journey has `step === null` — there is no step to put in a
    // URL, and where a finished journey sends the user is the host's call.
    expect(journeyStepPath(instance())).toBeNull();
  });

  it("honours a custom stepToPath", () => {
    const { instance } = setup();
    expect(journeyStepPath(instance(), (step) => step.entry)).toBe("show");
  });
});

describe("resolveJourneySyncAction", () => {
  it("resolves the current step's own path to `none`", () => {
    const { instance } = setup();
    expect(resolveJourneySyncAction(instance(), "a/show")).toEqual({ kind: "none" });
  });

  it("resolves a history frame to a rewind at that index", () => {
    const { id, harness, instance } = setup();
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    // history is [a, b]; current is c.
    expect(resolveJourneySyncAction(instance(), "a/show")).toEqual({
      kind: "rewind",
      historyIndex: 0,
    });
    expect(resolveJourneySyncAction(instance(), "b/show")).toEqual({
      kind: "rewind",
      historyIndex: 1,
    });
  });

  it("resolves a future frame to the number of goForward calls that reach it", () => {
    const { runtime, id, harness, instance } = setup();
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    runtime.goBack(id);
    runtime.goBack(id);
    // Back at `a`, with [b, c] on the redo stack — one goForward reaches b.
    expect(instance().step?.moduleId).toBe("a");
    expect(resolveJourneySyncAction(instance(), "b/show")).toEqual({ kind: "forward", count: 1 });
    expect(resolveJourneySyncAction(instance(), "c/show")).toEqual({ kind: "forward", count: 2 });
  });

  it("resolves a path this run has never visited to `unresolved`", () => {
    const { instance } = setup();
    expect(resolveJourneySyncAction(instance(), "c/show")).toEqual({ kind: "unresolved" });
    expect(resolveJourneySyncAction(instance(), "/some/other/page")).toEqual({
      kind: "unresolved",
    });
  });

  it("resolves a terminal journey to `none` rather than trying to move it", () => {
    const { id, harness, instance } = setup();
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    expect(resolveJourneySyncAction(instance(), "a/show")).toEqual({ kind: "none" });
  });

  it("picks the most recent occurrence when two history frames share a path", () => {
    const { id, harness, instance } = setup(loop);
    harness.fireExit(id, "next"); // a -> b
    harness.fireExit(id, "again"); // b -> a
    harness.fireExit(id, "next"); // a -> b
    // history is [a, b, a]; current is b. Both index 0 and index 2 are
    // "a/show" — one Back press should land on the one just left, not the
    // one from the top of the flow.
    expect(instance().history.map(defaultStepPath)).toEqual(["a/show", "b/show", "a/show"]);
    expect(resolveJourneySyncAction(instance(), "a/show")).toEqual({
      kind: "rewind",
      historyIndex: 2,
    });
  });

  it("uses the supplied stepToPath for both the current step and the frames", () => {
    const { id, harness, instance } = setup();
    harness.fireExit(id, "next");
    const byModule = (step: { moduleId: string }) => step.moduleId;
    expect(resolveJourneySyncAction(instance(), "b", byModule)).toEqual({ kind: "none" });
    expect(resolveJourneySyncAction(instance(), "a", byModule)).toEqual({
      kind: "rewind",
      historyIndex: 0,
    });
  });
});

describe("createJourneySync", () => {
  it("stamps the current step onto a fresh location without adding an entry", () => {
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort("/checkout");
    createJourneySync(runtime, id, port);
    // Replaced, not pushed: the host's own navigation to /checkout already
    // spent the history entry that got us here.
    expect(port.read()).toBe("a/show");
    expect(port.entries).toHaveLength(1);
  });

  it("pushes a new entry when the journey advances", () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();
    createJourneySync(runtime, id, port);

    harness.fireExit(id, "next");
    expect(port.read()).toBe("b/show");
    harness.fireExit(id, "next");
    expect(port.read()).toBe("c/show");
    // One entry per step, so Back has somewhere to go.
    expect(port.entries).toEqual(["a/show", "b/show", "c/show"]);
  });

  it("rewinds the journey when the user presses Back", () => {
    const { runtime, id, harness, instance } = setup();
    const port = createMemoryJourneySyncPort();
    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    expect(instance().step?.moduleId).toBe("c");

    port.go(-1);
    expect(instance().step?.moduleId).toBe("b");
    port.go(-1);
    expect(instance().step?.moduleId).toBe("a");
    // The rewind the sync drove notifies the runtime synchronously; that must
    // not re-enter and navigate a second time for a move the browser already
    // made. The stack is untouched and only the cursor moved.
    expect(port.entries).toEqual(["a/show", "b/show", "c/show"]);
    expect(port.index).toBe(0);
  });

  it("rewinds multiple steps in one call when the user jumps back through history", () => {
    const { runtime, id, harness, instance } = setup();
    const port = createMemoryJourneySyncPort();
    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");

    // Long-press Back / history dropdown: two entries at once.
    port.go(-2);
    expect(instance().step?.moduleId).toBe("a");
    expect(instance().history).toHaveLength(0);
  });

  it("moves the journey forward when the user presses Forward", () => {
    const { runtime, id, harness, instance } = setup();
    const port = createMemoryJourneySyncPort();
    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next");
    port.go(-1);
    expect(instance().step?.moduleId).toBe("a");

    port.go(1);
    expect(instance().step?.moduleId).toBe("b");
  });

  it("walks the location back — preserving the forward stack — when the journey rewinds itself", () => {
    const { runtime, id, harness, instance } = setup();
    const port = createMemoryJourneySyncPort();
    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next");
    expect(port.entries).toEqual(["a/show", "b/show"]);

    // An in-app Back button, not a browser one.
    runtime.goBack(id);
    expect(port.read()).toBe("a/show");
    // `go(-1)`, not `push`/`replace`: the b entry survives, so the browser's
    // Forward button still has somewhere to go...
    expect(port.entries).toEqual(["a/show", "b/show"]);
    expect(port.index).toBe(0);

    // ...and pressing it redoes the step.
    port.go(1);
    expect(instance().step?.moduleId).toBe("b");
  });

  it("falls back to replace when the port cannot navigate relatively", () => {
    const { runtime, id, harness } = setup();
    const base = createMemoryJourneySyncPort();
    // A port without `go` — the sync must still keep the URL truthful.
    const port: JourneySyncPort = {
      read: base.read,
      push: base.push,
      replace: base.replace,
      subscribe: base.subscribe,
    };
    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next");

    runtime.goBack(id);
    expect(port.read()).toBe("a/show");
    // Truthful, but the forward entry is gone — the documented cost of
    // omitting `go`.
    expect(base.entries).toEqual(["a/show", "a/show"]);
  });

  it("re-asserts the URL and reports when the journey refuses to go back", () => {
    const { runtime, id, harness, instance } = setup(locked);
    const port = createMemoryJourneySyncPort();
    const onBlocked = vi.fn();
    createJourneySync(runtime, id, port, { onBlocked });
    harness.fireExit(id, "next");
    expect(port.entries).toEqual(["a/show", "b/show"]);

    port.go(-1);

    // The journey never opted into back navigation, so it stays on `b`...
    expect(instance().step?.moduleId).toBe("b");
    // ...and the URL snaps forward to match, restoring the stack to exactly
    // its pre-Back shape so Back stays pressable.
    expect(port.read()).toBe("b/show");
    expect(port.entries).toEqual(["a/show", "b/show"]);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onBlocked.mock.calls[0]?.[0]).toMatchObject({ path: "a/show" });
  });

  it("reports a location the journey has never visited without touching it", () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();
    const onUnresolved = vi.fn();
    createJourneySync(runtime, id, port, { onUnresolved });
    harness.fireExit(id, "next");

    // The user clicked a nav link out of the flow.
    port.push("/settings");

    expect(onUnresolved).toHaveBeenCalledTimes(1);
    expect(onUnresolved.mock.calls[0]?.[0]).toMatchObject({ path: "/settings" });
    // Crucially the sync does NOT drag them back — that would trap them.
    expect(port.read()).toBe("/settings");
  });

  it("does not report the initial location as unresolved", () => {
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort("/checkout");
    const onUnresolved = vi.fn();
    createJourneySync(runtime, id, port, { onUnresolved });

    // "/checkout" names no step, but at mount that just means the URL has
    // not been stamped yet. Firing here would make a host that ends the
    // journey on unresolved kill the instance it just started.
    expect(onUnresolved).not.toHaveBeenCalled();
    expect(port.read()).toBe("a/show");
  });

  it("bounces a stale deep link to the step the journey actually starts on", () => {
    const { runtime, id } = setup();
    // A bookmark into the middle of a flow whose state no longer exists.
    const port = createMemoryJourneySyncPort("c/show");
    createJourneySync(runtime, id, port);

    expect(port.read()).toBe("a/show");
    expect(port.entries).toEqual(["a/show"]);
  });

  it("honours a location that names a real history frame on the first reconcile", () => {
    // Models a reload: the runtime is restored ahead of where the URL points,
    // and the URL is the more informed signal about where the user was.
    const { runtime, id, harness, instance } = setup();
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    expect(instance().step?.moduleId).toBe("c");

    const port = createMemoryJourneySyncPort("a/show");
    createJourneySync(runtime, id, port);

    expect(instance().step?.moduleId).toBe("a");
    expect(port.read()).toBe("a/show");
  });

  it("settles without echoing its own writes back into navigation", () => {
    const { runtime, id, harness } = setup();
    const base = createMemoryJourneySyncPort();
    const push = vi.fn(base.push);
    const replace = vi.fn(base.replace);
    const port: JourneySyncPort = { ...base, read: base.read, push, replace };
    createJourneySync(runtime, id, port);

    harness.fireExit(id, "next");

    // The sync's own push re-enters through the port subscription; it must
    // resolve to `none` rather than navigating again.
    expect(replace).toHaveBeenCalledTimes(1); // initial stamp
    expect(push).toHaveBeenCalledTimes(1); // the advance
  });

  it("leaves the location alone once the journey is terminal", () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();
    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");
    harness.fireExit(id, "next");

    // Completed: the host's `onFinished` decides where to go next, not us.
    expect(runtime.getInstance(id)?.status).toBe("completed");
    expect(port.read()).toBe("c/show");
  });

  it("writes nothing after stop()", () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();
    const sync = createJourneySync(runtime, id, port);
    sync.stop();

    harness.fireExit(id, "next");
    expect(port.read()).toBe("a/show");

    // And the reverse direction is detached too.
    port.go(-1);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
  });

  it("stop() is idempotent", () => {
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort();
    const sync = createJourneySync(runtime, id, port);
    sync.stop();
    expect(() => sync.stop()).not.toThrow();
  });

  it("tolerates an unknown instance id without throwing", () => {
    const { runtime } = setup();
    const port = createMemoryJourneySyncPort("/checkout");
    expect(() => createJourneySync(runtime, "nope" as InstanceId, port)).not.toThrow();
    expect(port.read()).toBe("/checkout");
  });

  it("maps steps through a custom stepToPath in both directions", () => {
    const { runtime, id, harness, instance } = setup();
    const port = createMemoryJourneySyncPort();
    createJourneySync(runtime, id, port, { stepToPath: (step) => `step-${step.moduleId}` });

    expect(port.read()).toBe("step-a");
    harness.fireExit(id, "next");
    expect(port.read()).toBe("step-b");

    port.go(-1);
    expect(instance().step?.moduleId).toBe("a");
  });
});

describe("createMemoryJourneySyncPort", () => {
  it("truncates the forward entries on push, like a browser", () => {
    const port = createMemoryJourneySyncPort("a");
    port.push("b");
    port.push("c");
    port.go(-2);
    expect(port.index).toBe(0);

    port.push("d");
    expect(port.entries).toEqual(["a", "d"]);
    expect(port.read()).toBe("d");
  });

  it("clamps go() at both ends", () => {
    const port = createMemoryJourneySyncPort("a");
    port.push("b");
    port.go(-99);
    expect(port.read()).toBe("a");
    port.go(99);
    expect(port.read()).toBe("b");
  });

  it("notifies subscribers on every navigation and stops after unsubscribe", () => {
    const port = createMemoryJourneySyncPort("a");
    const listener = vi.fn();
    const unsubscribe = port.subscribe(listener);
    port.push("b");
    port.replace("c");
    port.go(-1);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    port.push("d");
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
