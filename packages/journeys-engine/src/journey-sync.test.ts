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

/**
 * a -> b -> c, again with no `allowBack`: every rewind is refused, but the run
 * is long enough for a multi-entry Back (a history-menu jump past an
 * intermediate step) to be refused.
 */
const lockedLinear = defineJourney<Modules, Record<string, never>>()({
  id: "locked-linear",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { next: () => ({ next: { module: "c", entry: "show", input: undefined } }) } },
    c: { show: { next: () => ({ complete: undefined }) } },
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

  it("preserves entries skipped by a refused multi-entry Back instead of truncating them", () => {
    // From [a, b, c], a history-menu jump lands straight back on `a`. The
    // journey refuses the rewind (no `allowBack`), so the URL must return to
    // `c`. `push`-ing `c` from the `a` entry would truncate the forward stack
    // to [a, c] and lose `b`; with `go` available the sync walks the browser
    // forward the rejected distance, keeping the whole run intact.
    const { runtime, id, harness, instance } = setup(lockedLinear);
    const port = createMemoryJourneySyncPort();
    const onBlocked = vi.fn();
    createJourneySync(runtime, id, port, { onBlocked });
    harness.fireExit(id, "next"); // a -> b
    harness.fireExit(id, "next"); // b -> c
    expect(port.entries).toEqual(["a/show", "b/show", "c/show"]);
    expect(port.index).toBe(2);

    port.go(-2); // jump c -> a through the history menu

    // Refused: the journey stays on `c`...
    expect(instance().step?.moduleId).toBe("c");
    // ...and the full stack survives, cursor back on `c`, Back still pressable.
    expect(port.read()).toBe("c/show");
    expect(port.entries).toEqual(["a/show", "b/show", "c/show"]);
    expect(port.index).toBe(2);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onBlocked.mock.calls[0]?.[0]).toMatchObject({ path: "a/show" });
  });

  it("ignores a stale async go() that lands after a newer runtime advance", () => {
    // The one write that is genuinely async in a real router is the self-rewind
    // `go(-n)`. Model it: the port records the delta and only applies it when
    // `deliverGo()` is called, standing in for a router that settles a turn
    // later. Between issuing the `go` and its echo, the user advances again;
    // the stale echo must not drag the runtime back over the newer step. The
    // synchronous memory port cannot exhibit this, which is why the finding
    // could not be caught by the existing suite.
    const { runtime, id, harness, instance } = setup();
    const base = createMemoryJourneySyncPort();
    let queued: number | null = null;
    const port: JourneySyncPort = {
      read: base.read,
      push: base.push,
      replace: base.replace,
      go: (delta) => {
        queued = delta;
      },
      subscribe: base.subscribe,
    };
    const deliverGo = (): void => {
      if (queued === null) return;
      const delta = queued;
      queued = null;
      base.go(delta);
    };

    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next"); // a -> b, URL pushed to b/show
    expect(base.read()).toBe("b/show");

    // Runtime rewinds to `a`; the sync queues go(-1), but the router has not
    // delivered it, so the URL still shows `b`.
    runtime.goBack(id);
    expect(instance().step?.moduleId).toBe("a");
    expect(base.read()).toBe("b/show");

    // Before delivery, the user advances forward again to `b`.
    harness.fireExit(id, "next");
    expect(instance().step?.moduleId).toBe("b");

    // The stale go(-1) finally lands, moving the browser cursor back to `a`.
    // The sync catches it as stale (a newer runtime advance superseded it) and
    // re-asserts the URL. Crucially it does so by walking the cursor *forward*,
    // not by `replace`-ing the frame the cursor landed on — so the `a/show`
    // entry survives and Back stays pressable. That forward walk is another
    // async `go`, queued the same way.
    deliverGo();
    // The runtime never followed the stale echo...
    expect(instance().step?.moduleId).toBe("b");
    // ...and the stack is intact — `replace` here would have clobbered `a/show`
    // into `["b/show", "b/show"]`, silently dropping the frame Back returns to.
    expect(base.entries).toEqual(["a/show", "b/show"]);

    // The corrective forward `go(+1)` settles, landing the cursor back on `b`.
    deliverGo();
    expect(instance().step?.moduleId).toBe("b");
    expect(base.read()).toBe("b/show");
    expect(base.entries).toEqual(["a/show", "b/show"]);
  });

  it("preserves the stack when the runtime advances while a corrective go is pending", () => {
    // A second interleaving of the async-`go` race (the first is the test
    // above). Here the runtime advances to a *brand-new* step while the
    // sync's own corrective `go` is still in flight:
    //
    //   1. a -> b; `runtime.goBack()` rewinds to `a` and queues `go(-1)`.
    //   2. The runtime returns to `b`; the stale `go(-1)` lands on `a`, and the
    //      sync — seeing it superseded — queues a corrective forward `go(+1)`.
    //   3. Before that `+1` lands, the runtime advances `b -> c`.
    //   4. The `c` write happens while the browser cursor is still parked on
    //      `a`. Pushing `c` from there truncates `b`, and the queued `+1` then
    //      clamps at the top and never notifies.
    //
    // The stack must survive as [a, b, c] with Back still able to reach `b` and
    // `a`; the runtime and URL must both settle on `c`. Needs a FIFO deferred
    // port: the corrective `go` is issued from inside the delivery of the
    // previous one, so it has to queue behind it rather than replace it.
    const { runtime, id, harness, instance } = setup();
    const base = createMemoryJourneySyncPort();
    const queue: number[] = [];
    const port: JourneySyncPort = {
      read: base.read,
      push: base.push,
      replace: base.replace,
      go: (delta) => {
        queue.push(delta);
      },
      subscribe: base.subscribe,
    };
    const deliverGo = (): void => {
      const delta = queue.shift();
      if (delta === undefined) return;
      base.go(delta);
    };

    createJourneySync(runtime, id, port);
    harness.fireExit(id, "next"); // a -> b, URL pushed to b/show
    expect(base.entries).toEqual(["a/show", "b/show"]);
    expect(base.index).toBe(1);

    // 1. Runtime rewinds to `a`; the sync queues go(-1), URL still on `b`.
    runtime.goBack(id);
    expect(instance().step?.moduleId).toBe("a");
    expect(base.read()).toBe("b/show");

    // 2. The runtime returns to `b` before that go(-1) is delivered.
    runtime.goForward(id);
    expect(instance().step?.moduleId).toBe("b");

    // The stale go(-1) finally lands, parking the cursor on `a`. Superseded, so
    // the sync queues a corrective forward go(+1) rather than following it.
    deliverGo();
    expect(instance().step?.moduleId).toBe("b");
    expect(base.read()).toBe("a/show");

    // 3. The runtime advances to a brand-new step `c` while that corrective
    //    go(+1) is still queued.
    harness.fireExit(id, "next"); // b -> c
    expect(instance().step?.moduleId).toBe("c");

    // 4. Drain every remaining queued go. The stack must be intact.
    deliverGo();
    deliverGo();
    deliverGo();

    expect(instance().step?.moduleId).toBe("c");
    expect(base.read()).toBe("c/show");
    // The whole run survives — Back reaches `b` then `a`. A push from the stale
    // `a` cursor would have collapsed this to ["a/show", "c/show"], losing `b`.
    expect(base.entries).toEqual(["a/show", "b/show", "c/show"]);
    expect(base.index).toBe(2);
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

    // Advance once while attached so the port carries a real second frame; a
    // reverse `go` from index zero would be a no-op and could not detect a
    // leaked subscription.
    harness.fireExit(id, "next");
    expect(port.read()).toBe("b/show");
    sync.stop();

    // Forward direction detached: the runtime advances but the port does not.
    harness.fireExit(id, "next");
    expect(port.read()).toBe("b/show");

    // And the reverse direction is detached too: a real port notification no
    // longer rewinds the runtime.
    port.go(-1);
    expect(port.read()).toBe("a/show");
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("c");
  });

  it("stop() is idempotent", () => {
    const { runtime, id } = setup();
    const base = createMemoryJourneySyncPort();
    // A non-idempotent unsubscribe: the naturally-idempotent `Set.delete` the
    // memory port returns would hide a double cleanup, so throw on the second
    // call to prove `stop()` unsubscribes at most once.
    let portUnsubscribes = 0;
    const port: JourneySyncPort = {
      read: base.read,
      push: base.push,
      replace: base.replace,
      go: base.go,
      subscribe(listener) {
        const inner = base.subscribe(listener);
        return () => {
          portUnsubscribes += 1;
          if (portUnsubscribes > 1) throw new Error("port unsubscribe called more than once");
          inner();
        };
      },
    };
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
