// Journey <-> location reconciler. Framework-neutral and router-neutral: the
// runtime side is this package's own `JourneyRuntime`, and the location side
// is the narrow `JourneySyncPort` seam below, which a binding fills in with
// TanStack Router / React Router / vue-router / the History API / an in-memory
// stub for tests.
//
// Why this lives in the engine rather than in a binding: none of the logic is
// UI-framework-specific. It is a small state machine over `{ status, step,
// history, future }` and a path string, so React and Vue can share one
// implementation — and one test suite — instead of each re-deriving the
// push-vs-replace and back-vs-advance rules.

import type { InstanceId, JourneyInstance, JourneyRuntime, JourneyStep } from "./types.js";

/**
 * The location seam. Implemented once per router by the app (or by a future
 * router-binding package) and handed to {@link createJourneySync}.
 *
 * Paths are **opaque strings** to the sync — it only ever compares them for
 * equality and hands back strings produced by `stepToPath`. That means the
 * port owns every routing concern the sync should not know about: the base
 * path (`/checkout/` + segment), whether the step lives in a path segment or
 * a search param, and any encoding. Keep `read()` and the strings passed to
 * `push`/`replace` in the same space, and the sync stays correct.
 *
 * @example
 * ```ts
 * // TanStack Router, step carried in a `/checkout/$step` param.
 * const port: JourneySyncPort = {
 *   read: () => router.state.location.pathname.replace(/^\/checkout\//, ""),
 *   push: (path) => router.navigate({ to: "/checkout/$step", params: { step: path } }),
 *   replace: (path) =>
 *     router.navigate({ to: "/checkout/$step", params: { step: path }, replace: true }),
 *   go: (delta) => router.history.go(delta),
 *   subscribe: (listener) => router.subscribe("onResolved", listener),
 * };
 * ```
 */
export interface JourneySyncPort {
  /** The current location, in whatever space `stepToPath` produces. */
  read(): string;
  /** Navigate to `path`, adding a history entry. */
  push(path: string): void;
  /** Navigate to `path`, replacing the current history entry. */
  replace(path: string): void;
  /**
   * Relative history navigation, if the router exposes it. Optional, and
   * worth supplying: it is the difference between a working browser Forward
   * button and a dead one.
   *
   * When the journey rewinds on its own (a step's `goBack` prop, an in-app
   * Back button), the sync uses `go(-n)` so the browser's forward stack is
   * preserved and Forward redoes the step. Without `go`, the sync falls back
   * to `replace`, which keeps the URL truthful but drops the forward entry —
   * the user's Forward button will not redo the step.
   *
   * Only supply this when the journey owns a contiguous run of history
   * entries. If the shell pushes unrelated entries mid-journey (a modal that
   * pushes, a search-param write), `go(-n)` can land outside the journey; the
   * sync detects the miss and reports it through `onUnresolved` rather than
   * guessing, but `replace` would have been the safer choice.
   */
  go?(delta: number): void;
  /** Fires on every location change, including the sync's own writes. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/**
 * What the sync decided to do about a location that disagrees with the
 * journey. Produced by the pure {@link resolveJourneySyncAction} and acted on
 * by {@link createJourneySync} — split apart so the decision table is
 * testable without a runtime or a router.
 */
export type JourneySyncAction =
  /** Location and journey already agree, or the journey cannot move right now. */
  | { readonly kind: "none" }
  /** The location names a frame in `history`; rewind to that index. */
  | { readonly kind: "rewind"; readonly historyIndex: number }
  /** The location names a frame in `future`; `count` successive `goForward` calls reach it. */
  | { readonly kind: "forward"; readonly count: number }
  /**
   * The location names no frame this journey knows about. Not an error — it
   * is what a deep link into a cold journey, or a click on a nav link out of
   * the flow, looks like from in here.
   */
  | { readonly kind: "unresolved" };

export interface JourneySyncCallbackCtx {
  /** The location that triggered the callback. */
  readonly path: string;
  /** The instance as of the callback. */
  readonly instance: JourneyInstance;
}

export interface JourneySyncOptions {
  /**
   * Maps a step to its location. Defaults to {@link defaultStepPath}
   * (`"moduleId/entry"`).
   *
   * Must be **pure and stable**: the sync calls it on the current step and on
   * every history / future frame to decide what a location refers to, so a
   * mapping that changes between calls makes those frames unaddressable.
   *
   * Ideally **injective** — two steps that share a path are indistinguishable
   * to the sync. See "Ambiguous paths" on {@link resolveJourneySyncAction}
   * for what happens when they are not; if a journey revisits an entry with
   * different meaning (an edit-then-review loop), fold the distinguishing bit
   * into the path (`step.input` is available here).
   */
  readonly stepToPath?: (step: JourneyStep) => string;
  /**
   * Fires when a location change names no frame this journey knows about
   * (`{ kind: "unresolved" }`) — the user clicked a link out of the flow, or
   * edited the URL to a step this run never visited.
   *
   * **The sync deliberately does nothing else in this case** — it will not
   * force the URL back, because that would trap a user who just navigated
   * away on purpose. Decide here: `runtime.end(...)` to abandon the journey,
   * or navigate to the journey's real step to bounce a stale link. Omitting
   * the callback leaves the URL and the journey disagreeing, which is almost
   * never what you want — the one exception is a host that unmounts the
   * journey on any foreign location anyway.
   *
   * **Not fired for the initial reconcile**, including an explicit
   * {@link JourneySync.sync}. At mount the location has not been stamped with
   * a step yet (the host's own navigation to `/checkout` is what got us
   * here), so "unresolved" is the expected state rather than a signal — and a
   * host that ends the journey on this callback would otherwise kill the
   * instance it just started. A stale deep link is handled by the same rule:
   * the journey starts at its real first step and the sync rewrites the URL
   * to match.
   */
  readonly onUnresolved?: (ctx: JourneySyncCallbackCtx) => void;
  /**
   * Fires when the journey **refused** to follow the location — the frame is
   * real but the runtime would not move to it. Happens when the transition
   * did not opt in with `allowBack: true`, when the entry declares
   * `allowBack: false`, or when a child journey is in flight (parent steps
   * are paused while a child runs).
   *
   * Before this fires, the sync re-asserts the step the journey is actually
   * on via `port.push`, which is the standard "block the Back button"
   * shape: the URL snaps forward and the user stays put. Use the callback to
   * explain why ("your payment is already submitted"), not to navigate.
   *
   * **The trigger is "the journey did not end up where the location asked",
   * which is *usually* a refusal but not always.** `rewindTo` re-runs the
   * destination entry's `buildInput` against the rewound state, so a
   * `stepToPath` that folds `step.input` in — what
   * {@link JourneySyncOptions.stepToPath} suggests for a journey that revisits
   * an entry — can map the landed step to a different path than the one asked
   * for, even though the rewind succeeded. The URL correction is right either
   * way; only the name is off. `ctx.instance` is the post-move instance, so
   * compare its step against `ctx.path` if you need to tell the two apart.
   */
  readonly onBlocked?: (ctx: JourneySyncCallbackCtx) => void;
}

export interface JourneySync {
  /**
   * Force a reconcile. Rarely needed — the sync already runs on every runtime
   * notification and every location change. Reach for it when a port cannot
   * notify on some transition it makes.
   */
  sync(): void;
  /** Detach both subscriptions. Idempotent; the sync writes nothing after this. */
  stop(): void;
}

/**
 * Default {@link JourneySyncOptions.stepToPath} — `"moduleId/entry"`.
 *
 * Injective for the common case (a journey that visits each entry at most
 * once per run) and readable in a URL. Pass your own when you want prettier
 * segments, or when a journey revisits an entry and the occurrences must be
 * told apart.
 */
export function defaultStepPath(step: JourneyStep): string {
  return `${step.moduleId}/${step.entry}`;
}

/**
 * The location a journey's current step should be at, or `null` when the
 * journey has no step to represent — it is `loading` (async persistence has
 * not hydrated yet) or terminal (`step` is `null` once a journey completes or
 * aborts).
 *
 * `null` means "leave the URL alone", not "clear the URL": where a finished
 * journey sends the user is the host's call, and the sync never makes it.
 */
export function journeyStepPath(
  instance: JourneyInstance,
  stepToPath: (step: JourneyStep) => string = defaultStepPath,
): string | null {
  if (instance.status !== "active" || !instance.step) return null;
  return stepToPath(instance.step);
}

/**
 * Decide what a location means for a journey. Pure — no runtime calls, no
 * navigation, no I/O — so the decision table can be tested directly.
 *
 * **Why a journey cannot simply be "navigated" to a path.** A journey's step
 * is derived from its state, and {@link JourneyStep} carries no identity — it
 * is `{ moduleId, entry, input }` and nothing more. There is no `goToStep`,
 * and there could not be one: landing on "review" requires the state that the
 * earlier steps produced. So the only positions a location can select are the
 * ones the journey has already been to (`history`) or has just rewound from
 * (`future`). Everything else is `unresolved` by construction, and the host
 * decides what that means.
 *
 * **Ambiguous paths.** When `stepToPath` maps two frames to the same string,
 * the nearest occurrence to the current step wins — history is searched
 * newest-first, `future` bottom-up from the next `goForward` target. That is
 * the right answer for one Back press out of a loop, and the wrong answer for
 * three, which is why {@link JourneySyncOptions.stepToPath} should be
 * injective. The sync cannot do better: a path is all the browser gives back.
 *
 * Returns `{ kind: "none" }` for any journey that cannot move right now —
 * `loading`, terminal, or already at the requested path.
 */
export function resolveJourneySyncAction(
  instance: JourneyInstance,
  path: string,
  stepToPath: (step: JourneyStep) => string = defaultStepPath,
): JourneySyncAction {
  const current = journeyStepPath(instance, stepToPath);
  if (current === null) return { kind: "none" };
  if (current === path) return { kind: "none" };

  // Newest-first: one Back press out of a loop should land on the occurrence
  // the user just left, not the first one they ever visited.
  for (let i = instance.history.length - 1; i >= 0; i -= 1) {
    const frame = instance.history[i];
    if (frame && stepToPath(frame) === path) return { kind: "rewind", historyIndex: i };
  }

  // `future` is a stack: the top (last element) is what one `goForward`
  // restores, so reaching `future[length - n]` takes n calls. Walking n
  // upward searches nearest-first, mirroring the history pass.
  for (let n = 1; n <= instance.future.length; n += 1) {
    const frame = instance.future[instance.future.length - n];
    if (frame && stepToPath(frame) === path) return { kind: "forward", count: n };
  }

  return { kind: "unresolved" };
}

/**
 * Keep a journey instance and the browser location in step, in both
 * directions: the journey advances and the URL follows; the user presses Back
 * or Forward and the journey follows.
 *
 * **Why this is not a diff.** The tempting implementation compares the URL to
 * the runtime on every render and reconciles the difference. It does not work:
 * "the journey advanced" and "the user pressed Back" both present as *the URL
 * naming an earlier step than the runtime*, and telling them apart after the
 * fact needs bookkeeping that races with React's render loop. This sync is
 * event-sourced instead — it reacts to the runtime's notification and to the
 * port's notification as **separate signals**, so the direction is known
 * before anything is decided, and no disambiguation is needed.
 *
 * Both directions are idempotent, which is what makes the loop safe: the
 * sync's own `push` re-enters through the port's subscription, resolves to
 * `{ kind: "none" }` because the journey is already there, and stops. No
 * echo-suppression latch, no "ignore the next event" flag.
 *
 * Push vs. replace follows the journey's own depth (`history.length`):
 * advancing pushes an entry, so Back has somewhere to go; rewinding uses
 * `port.go(-n)` when available so Forward keeps working; the first sync
 * replaces, since the host's own navigation already spent an entry getting
 * here.
 *
 * The sync **never starts, ends, or otherwise touches the instance's
 * lifecycle** — it only navigates within a journey that is already running.
 * Pair it with `<JourneyHost>` (React) / `<JourneyHost>` (Vue), which owns
 * start-on-mount and end-on-unmount.
 *
 * **A sync tracks exactly the instance it is given — it does not follow child
 * journeys.** When this instance `invoke`s a child, the parent pauses on its
 * invoking step and the child runs on its own instance. This sync keeps
 * mirroring the *parent's* step (the paused one), and a Back press against it
 * resolves through `onBlocked` — a child in flight is one of the documented
 * reasons the runtime refuses a rewind. It deliberately does **not** reach
 * into the child's `history`/`future`: a child's steps are the child's own
 * URL space, and splicing two instances' histories into one path string would
 * make neither addressable. To deep-link within a child, mount a second sync
 * on the child instance (e.g. from the child's own host). Nested-journey URL
 * composition beyond that — a single path that encodes both levels — is out of
 * scope for this primitive.
 *
 * @example
 * ```ts
 * const sync = createJourneySync(runtime, instanceId, port, {
 *   stepToPath: (step) => step.entry,
 *   onUnresolved: () => runtime.end(instanceId, { reason: "navigated-away" }),
 * });
 * // later
 * sync.stop();
 * ```
 */
export function createJourneySync(
  runtime: JourneyRuntime,
  instanceId: InstanceId,
  port: JourneySyncPort,
  options: JourneySyncOptions = {},
): JourneySync {
  const { stepToPath = defaultStepPath, onUnresolved, onBlocked } = options;

  /**
   * The journey depth (`history.length`) the last URL write represented.
   * `null` until the first write. This is the sync's entire memory — one
   * number — and it exists only to tell an advance from a rewind when the
   * runtime notifies. Nothing about the *URL* is remembered, because the
   * port is always authoritative for that.
   */
  let lastDepth: number | null = null;
  /**
   * Set while the sync is driving the runtime from a location change.
   * `rewindTo` / `goForward` notify their subscribers synchronously, and that
   * notification would otherwise re-enter `writeUrl` and navigate a second
   * time for a move the browser already made.
   */
  let applying = false;
  let stopped = false;

  /**
   * Navigation generations, guarding the one write that is genuinely async in
   * a real router: the `port.go(-n)` a self-rewind issues (§ `writeUrl`).
   *
   * `port.go` returns before the browser has moved; its location change lands a
   * turn or more later, as a port notification. Between issuing the `go` and
   * that echo arriving, the runtime can advance again (the user clicks Next
   * before the router settles the Back). The late echo then reads a path that
   * resolves to a rewind and would drag the runtime back over the newer state —
   * the classic "stale navigation wins" race, invisible to the synchronous
   * memory port but real against TanStack / React Router / vue-router.
   *
   * `runtimeEpoch` counts genuine runtime advances. When `writeUrl` issues a
   * `go`, it stamps `pendingGoEpoch` with the epoch at that moment. When the
   * echo arrives, a higher `runtimeEpoch` means a newer runtime event
   * superseded the `go`: the sync refuses to follow it and re-asserts the URL
   * to the runtime's current step instead. Only the latest `go` is tracked —
   * more than one in flight is already outside the "journey owns a contiguous
   * run of history" contract the relative-navigation path depends on.
   */
  let runtimeEpoch = 0;
  let pendingGoEpoch: number | null = null;

  /** Runtime -> location. */
  const writeUrl = (): void => {
    if (stopped) return;
    const instance = runtime.getInstance(instanceId);
    if (!instance) return;
    const target = journeyStepPath(instance, stepToPath);
    // Loading or terminal: nothing to represent. Leave the URL as-is — see
    // `journeyStepPath`.
    if (target === null) return;

    const depth = instance.history.length;
    if (port.read() !== target) {
      if (lastDepth === null || depth === lastDepth) {
        // First sync (the host's navigation already spent an entry getting
        // here), or a same-depth step swap. Neither should grow the stack.
        port.replace(target);
      } else if (depth > lastDepth) {
        // Advanced. Push so Back returns to the step we just left.
        port.push(target);
      } else if (port.go) {
        // Rewound from inside the journey. Walk the browser back the same
        // distance rather than pushing, so the forward stack survives and
        // Forward redoes the step. Async in every real router — the port's
        // notification lands later and reconciles to `{ kind: "none" }`, or,
        // if the runtime advanced in the meantime, is caught as stale by the
        // epoch guard in `readUrl`. Stamp the epoch *before* issuing the `go`:
        // a synchronous port (the memory stub, tests) notifies re-entrantly
        // from inside the call, so the guard has to already see the pending go.
        pendingGoEpoch = runtimeEpoch;
        port.go(depth - lastDepth);
      } else {
        port.replace(target);
      }
    }
    lastDepth = depth;
  };

  /**
   * Location -> runtime. `reportUnresolved` is false for the initial
   * reconcile, where a location that names no frame is simply a URL that has
   * not been stamped yet — see {@link JourneySyncOptions.onUnresolved}.
   */
  const readUrl = (reportUnresolved: boolean): void => {
    if (stopped) return;
    const instance = runtime.getInstance(instanceId);
    if (!instance) return;
    const path = port.read();
    const action = resolveJourneySyncAction(instance, path, stepToPath);

    // Resolve the pending self-rewind `go`, if any. This notification is either
    // its echo (nothing newer happened — let it reconcile, which will be a
    // no-op since the runtime is already where the `go` aimed) or a stale echo
    // the runtime has since moved past. The latter must not drive the runtime:
    // re-assert the URL to the current step and drop the location change.
    if (pendingGoEpoch !== null) {
      const superseded = runtimeEpoch !== pendingGoEpoch;
      pendingGoEpoch = null;
      if (superseded && action.kind !== "none") {
        // The stale `go(-n)` only moved the browser *cursor* back onto an
        // earlier frame; it did not destroy any entries. Re-assert the URL to
        // the runtime's current step by walking the cursor forward the same
        // distance (`history.length - historyIndex`), which leaves the whole
        // stack — and therefore Back — intact. `writeUrl` here would see equal
        // depth and `replace` the frame the cursor landed on, overwriting the
        // entry Back needs (`[a, b]` cursor on `a` -> `[b, b]`). Walking
        // forward is itself async in a real router, so stamp a fresh epoch so
        // a newer advance can supersede this correction in turn. `writeUrl` is
        // the fallback only when the port cannot navigate relatively, where the
        // forward stack is forfeit anyway.
        if (action.kind === "rewind" && port.go) {
          pendingGoEpoch = runtimeEpoch;
          port.go(instance.history.length - action.historyIndex);
        } else {
          writeUrl();
        }
        return;
      }
    }

    if (action.kind === "none") return;
    if (action.kind === "unresolved") {
      if (reportUnresolved) onUnresolved?.({ path, instance });
      return;
    }

    applying = true;
    try {
      if (action.kind === "rewind") {
        // Guard first: `rewindTo` is a silent no-op when a frame it would
        // leave has not opted into back navigation, and we need to tell
        // "moved" from "refused" to decide whether to re-assert the URL.
        if (runtime.canRewindTo(instanceId, action.historyIndex)) {
          runtime.rewindTo(instanceId, action.historyIndex);
        }
      } else {
        for (let i = 0; i < action.count; i += 1) {
          if (!runtime.canGoForward(instanceId)) break;
          runtime.goForward(instanceId);
        }
      }
    } finally {
      applying = false;
    }

    const after = runtime.getInstance(instanceId);
    if (!after) return;
    lastDepth = after.history.length;

    const landed = journeyStepPath(after, stepToPath);
    if (landed === null || landed === port.read()) return;
    // The journey would not go where the location asked. Snap the URL back to
    // the step the user is actually on.
    //
    // A refused rewind left the browser sitting `after.history.length -
    // action.historyIndex` entries behind the journey's step. When the port
    // can navigate relatively, walk it forward by exactly that distance: the
    // in-between entries (a `b` skipped over by a `c → a` history-menu jump)
    // survive, and Back stays pressable on the whole run. `push` cannot do
    // this — pushing from an earlier entry truncates everything ahead of it,
    // collapsing `[a, b, c]` to `[a, c]` and losing `b`. So `push` is only the
    // fallback for a port without `go`, where the forward stack is forfeit
    // anyway (the same cost the advance path documents).
    if (action.kind === "rewind" && port.go) {
      port.go(after.history.length - action.historyIndex);
    } else {
      port.push(landed);
    }
    onBlocked?.({ path, instance: after });
  };

  const sync = (): void => {
    // Location first: on a reload the URL is the older, more informed signal —
    // it may name a history frame the freshly-hydrated journey should rewind
    // to. `writeUrl` then corrects the URL if the journey declined, could not
    // resolve it, or was never there at all.
    readUrl(false);
    writeUrl();
  };

  const unsubscribeRuntime = runtime.subscribe(instanceId, () => {
    // `applying` notifications are the sync's own `rewindTo`/`goForward`, not
    // genuine runtime moves, so they neither advance the epoch nor write.
    if (applying) return;
    runtimeEpoch += 1;
    writeUrl();
  });
  const unsubscribePort = port.subscribe(() => {
    readUrl(true);
  });

  sync();

  return {
    sync,
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribeRuntime();
      unsubscribePort();
    },
  };
}

/**
 * In-memory {@link JourneySyncPort} over a plain array of entries. Intended
 * for tests and for headless hosts (a wizard in a canvas app, a CLI-driven
 * simulation) that want journey history semantics without a browser.
 *
 * Models the browser's stack faithfully enough to be worth testing against:
 * `push` truncates the forward entries, `go` clamps at both ends, and every
 * mutation notifies subscribers synchronously (a real router's `go` is async;
 * tests that care should drive `go` and assert afterwards).
 */
export function createMemoryJourneySyncPort(initialPath = ""): JourneySyncPort & {
  /** The full stack, oldest first. */
  readonly entries: readonly string[];
  /** Index of the current entry within `entries`. */
  readonly index: number;
} {
  let entries: string[] = [initialPath];
  let index = 0;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    get entries() {
      return entries;
    },
    get index() {
      return index;
    },
    read: () => entries[index] as string,
    push(path) {
      entries = [...entries.slice(0, index + 1), path];
      index = entries.length - 1;
      notify();
    },
    replace(path) {
      entries = [...entries];
      entries[index] = path;
      notify();
    },
    go(delta) {
      const next = Math.min(Math.max(index + delta, 0), entries.length - 1);
      if (next === index) return;
      index = next;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
