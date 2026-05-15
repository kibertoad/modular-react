import { Component, Suspense, createElement, useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import type { ModuleDescriptor, ModuleEntryPoint } from "@modular-react/core";
import { resolveEntryComponent } from "@modular-react/react";

import { getInternals } from "./runtime.js";
import { useJourneyContext } from "./provider.js";
import { isAnnotatedTransition } from "./define-transition.js";
import { useCallChain, useInstanceSnapshot, useLeafId } from "./instance-hooks.js";
import type {
  AnyJourneyDefinition,
  InstanceId,
  JourneyRuntime,
  JourneyStep,
  TerminalOutcome,
} from "./types.js";

export type JourneyStepErrorPolicy = "abort" | "retry" | "ignore";

/** Maximum automatic retries before falling back to `abort`. */
const DEFAULT_RETRY_CAP = 2;

export interface JourneyOutletNotFoundProps {
  readonly moduleId: string;
  readonly entry: string;
}

export interface JourneyOutletErrorProps {
  readonly moduleId: string;
  readonly error: unknown;
}

export interface JourneyOutletProps {
  /**
   * Runtime to drive the outlet against. Optional when a `<JourneyProvider>`
   * is mounted above — the outlet reads the runtime from context in that
   * case. Explicit prop overrides context, so one outlet can reach a
   * different runtime when needed.
   */
  readonly runtime?: JourneyRuntime;
  readonly instanceId: InstanceId;
  /**
   * Module descriptors the outlet resolves step components against.
   * Optional — when omitted, the outlet pulls the descriptors the runtime
   * was constructed with (the common case).
   */
  readonly modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  readonly loadingFallback?: ReactNode;
  readonly onFinished?: (outcome: TerminalOutcome) => void;
  readonly onStepError?: (err: unknown, ctx: { step: JourneyStep }) => JourneyStepErrorPolicy;
  /**
   * When `false`, the outlet renders the instance you handed it directly,
   * even if it has a child journey in flight. Set this when you compose
   * two outlets to render parent and child side-by-side or in a modal —
   * the parent outlet stays on the parent's step, and a sibling outlet
   * keyed off `instance.activeChildId` renders the child.
   *
   * When `true` (the default), the outlet walks the active call chain
   * from the supplied `instanceId` down to the leaf and renders the leaf,
   * matching the subroutine intuition: a child takes over the same
   * outlet for the duration of its run.
   */
  readonly leafOnly?: boolean;
  /**
   * Cap on `retry` responses before the outlet falls back to `abort`. The
   * counter increments on every retry from `onStepError` and is never reset,
   * so a step that causes a downstream step to also throw cannot bypass the
   * cap by bumping the step token. Default: 2.
   */
  readonly retryLimit?: number;
  /**
   * Rendered when the current step points at a module/entry that is not
   * registered with the runtime. Defaults to a plain red notice.
   */
  readonly notFoundComponent?: ComponentType<JourneyOutletNotFoundProps>;
  /**
   * Rendered when a step component throws. Defaults to a plain red notice
   * with the error message. Receives the raw error so shells can route it
   * through their own reporting.
   */
  readonly errorComponent?: ComponentType<JourneyOutletErrorProps>;
  /**
   * Speculatively prefetch the chunks for entries reachable from the
   * current step during idle time after mount, so the next click finds
   * its bundle hot.
   *
   *   `"precise"` (default, alias `true`) — read declared `targets` from
   *     `defineTransition({ targets, handle })`-annotated handlers on the
   *     current step's transitions. Preload exactly those entries.
   *     Bare-function handlers contribute nothing (this is the precise
   *     mode's whole point — no guessing).
   *
   *   `"aggressive"` — preload every entry that appears as a transition
   *     source OR as a declared `target` of any annotated handler in the
   *     journey's `transitions` map. The destination-side pass catches
   *     terminal-only steps that have no outbound transitions of their
   *     own (e.g. a freshly-added receipt screen reachable from `next:`
   *     but not yet wired with its own exits). A step reachable only
   *     via `definition.start` AND with no outbound transitions of its
   *     own is the one remaining static gap — but such a step can only
   *     be the current step on first mount (no exits → no advance), and
   *     the skip-current logic already excludes it. Useful when handlers
   *     are not annotated and the journey is small enough that warming
   *     all candidates is cheap.
   *
   *   `false` — opt out entirely.
   *
   * Has no effect for eager (`component:`) entries — their import is
   * already resolved. Effects only fire in the browser; SSR is a no-op.
   */
  readonly preload?: boolean | "precise" | "aggressive";
}

/**
 * Renders the current step of a journey instance. Host-agnostic — works in
 * a tab, modal, route element, or plain `<div>`. On unmount while active,
 * the instance is abandoned (deferred by a microtask so React 18/19
 * StrictMode's simulated mount/unmount/mount cycle does not tear the
 * instance down on its first visit).
 */
export function JourneyOutlet(props: JourneyOutletProps): ReactNode {
  const context = useJourneyContext();
  const {
    runtime: runtimeProp,
    instanceId,
    modules: modulesProp,
    loadingFallback,
    onFinished,
    onStepError,
    retryLimit = DEFAULT_RETRY_CAP,
    notFoundComponent,
    errorComponent,
    leafOnly = true,
    preload = "precise",
  } = props;

  const runtime = runtimeProp ?? context?.runtime;
  if (!runtime) {
    throw new Error(
      "[@modular-react/journeys] <JourneyOutlet> needs a runtime. Either pass `runtime` or mount a <JourneyProvider>.",
    );
  }

  // Subscribe to the originally-supplied (root) instance so onFinished and
  // abandon-on-unmount resolve against THAT instance — even when leaf-walk
  // is rendering a different (child/grandchild) record. The leaf is also
  // subscribed-to via `useLeafId` so this component re-renders when the
  // call chain shifts (parent invokes a child, child terminates, etc.).
  const rootInstance = useInstanceSnapshot(runtime, instanceId);
  const leafId = useLeafId(runtime, instanceId, leafOnly);
  // Subscribe to the leaf separately so leaf-internal transitions trigger
  // re-renders. When the leaf id equals the root, useInstanceSnapshot
  // dedupes naturally (same subscribe call to the same record).
  const leafInstance = useInstanceSnapshot(runtime, leafId);
  const instance = leafId === instanceId ? rootInstance : leafInstance;
  const internals = getInternals(runtime);
  const modules = modulesProp ?? internals.__moduleMap;
  const [retryKey, setRetryKey] = useState(0);

  // Abandon on unmount while still active or still loading. Two defenses:
  //
  // 1. StrictMode fires cleanup synchronously and then remounts the same
  //    component — deferring the abandon one microtask and re-checking the
  //    same `mountedRef` keeps the journey alive through that dance.
  //
  // 2. Two independent outlets rendering the same instance back-to-back
  //    (unmount outlet A, mount outlet B) show up as `mountedRef.current
  //    === false` because they are different component instances. To keep
  //    outlet B's instance alive we also consult `record.listeners.size` —
  //    if any subscriber is still attached, another outlet has taken over
  //    and we skip the `end()`.
  //
  // Targets the ROOT — `runtime.end` cascades to any active child, so a
  // single call cleans the whole chain.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (mountedRef.current) return;
        const record = internals.__getRecord(instanceId);
        if (!record) return;
        if (record.status !== "active" && record.status !== "loading") return;
        if (record.listeners.size > 0) return;
        runtime.end(instanceId, { reason: "unmounted" });
      });
    };
  }, [runtime, instanceId, internals]);

  // Fire onFinished exactly once on terminal — bound to the ROOT, since
  // the caller asked to be notified when the journey they mounted finishes.
  // Child terminations are observed via the parent's resume handler and
  // are not reported through this hook.
  const finishedFiredRef = useRef(false);
  useEffect(() => {
    if (!rootInstance) return;
    if (rootInstance.status !== "completed" && rootInstance.status !== "aborted") return;
    if (finishedFiredRef.current) return;
    finishedFiredRef.current = true;
    onFinished?.({
      status: rootInstance.status,
      payload: rootInstance.terminalPayload,
      instanceId: rootInstance.id,
      journeyId: rootInstance.journeyId,
    });
  }, [rootInstance, onFinished]);

  // Speculative preload of reachable entries' chunks. Runs after the current
  // step is settled in-DOM; cancels on step change so a fast advance does
  // not race with the previous step's preload set. Deps are deliberately
  // narrow — `instance` itself changes reference on every snapshot bump
  // (timestamps, child-id shifts), and re-running preload on those is wasted
  // work. We re-key the effect on (status, module, entry, journey) instead.
  const isActive = instance?.status === "active";
  const stepModuleId = instance?.step?.moduleId;
  const stepEntryName = instance?.step?.entry;
  const journeyId = instance?.journeyId;
  useEffect(() => {
    if (preload === false || !isActive) return;
    if (!stepModuleId || !stepEntryName || !journeyId) return;
    const reg = internals.__getRegistered(journeyId);
    if (!reg) return;
    const mode = preload === "aggressive" ? "aggressive" : "precise";
    const targets = collectPreloadTargets(
      reg.definition,
      modules,
      stepModuleId,
      stepEntryName,
      mode,
    );
    if (targets.length === 0) return;

    let cancelled = false;
    const run = (): void => {
      if (cancelled) return;
      for (const entry of targets) {
        try {
          resolveEntryComponent(entry).preload();
        } catch {
          // Best-effort: a malformed entry would have failed validation
          // upstream. Swallow here so one bad entry never hides the rest.
        }
      }
    };

    const ricFn = (
      globalThis as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      }
    ).requestIdleCallback;
    const cicFn = (globalThis as { cancelIdleCallback?: (handle: number) => void })
      .cancelIdleCallback;
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (typeof ricFn === "function") {
      idleHandle = ricFn(run, { timeout: 2000 });
    } else {
      timeoutHandle = setTimeout(run, 0);
    }
    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof cicFn === "function") cicFn(idleHandle);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    };
  }, [preload, isActive, stepModuleId, stepEntryName, journeyId, internals, modules]);

  if (!instance) return null;
  if (instance.status === "loading") return loadingFallback ?? null;
  if (instance.status === "completed" || instance.status === "aborted") return null;

  const step = instance.step;
  if (!step) return null;

  const mod = modules[step.moduleId];
  const entry = mod?.entryPoints?.[step.entry];
  if (!mod || !entry) {
    const NotFound = notFoundComponent ?? DefaultNotFound;
    return createElement(NotFound, { moduleId: step.moduleId, entry: step.entry });
  }

  // Resolve the *leaf's* record and registration so the step callbacks
  // (`exit`, `goBack`) drive the leaf's transitions. Using the root's
  // record here would cross wires — exits dispatched by the leaf module
  // would land on the parent's step.
  const record = internals.__getRecord(instance.id);
  const reg = internals.__getRegistered(instance.journeyId);
  if (!record || !reg) return null;
  const { exit, goBack, goForward } = internals.__bindStepCallbacks(record, reg);

  const handleError = (err: unknown): void => {
    // Registration-level onError fires on every component throw — shell
    // telemetry observes the error even when the outlet decides to retry
    // or ignore. Route through the runtime so `fireOnError` stays the
    // single owner of hook firing (including its own try/catch around
    // throwing hooks); the outlet never reads `reg.options.onError`
    // directly. Bound to the LEAF's instance id since the throw came from
    // the leaf step's component.
    internals.__fireComponentError(instance.id, err, step);
    let policy = onStepError?.(err, { step }) ?? "abort";
    if (policy === "retry") {
      // Defer the budget check to the runtime so the counter is owned in
      // one place and survives transition side-effects that advance
      // stepToken mid-retry.
      if (!internals.__consumeRetry(instance.id, retryLimit)) {
        policy = "abort";
      }
    }
    if (policy === "abort") {
      // End the LEAF — its abort cascades via the parent's resume handler
      // (which sees `outcome.status === "aborted"` and decides what to do),
      // matching the runtime's normal "child aborted" path. Calling end on
      // the root would skip the parent's chance to recover.
      runtime.end(instance.id, { reason: "component-error", error: err });
      return;
    }
    if (policy === "retry") {
      setRetryKey((k) => k + 1);
    }
    // 'ignore' — leave the boundary UI in place until the user navigates away
  };

  // Resolve eager (`component:`) and lazy (`lazy:`) entries through the
  // shared helper. Lazy entries get a memoized `React.lazy` wrapper plus an
  // idempotent `preload()`; eager entries pass through as-is. Both render
  // sites (here and `ModuleTab`) call this so the per-descriptor cache
  // is shared.
  const { Component: StepComponent } = resolveEntryComponent(entry);
  const stepKey = `${record.stepToken}:${retryKey}`;
  // For eager entries `entry.fallback` is typed `never` (and is always
  // `undefined` at runtime); for lazy entries it's the optional Suspense
  // fallback. Either way, fall through to the outlet-level `loadingFallback`.
  const suspenseFallback = entry.fallback ?? loadingFallback ?? null;

  return createElement(
    StepErrorBoundary,
    {
      moduleId: step.moduleId,
      onError: handleError,
      errorComponent,
      key: stepKey,
      children: null,
    },
    createElement(
      Suspense,
      { fallback: suspenseFallback },
      createElement(StepComponent, {
        input: step.input,
        exit,
        goBack,
        goForward,
      }),
    ),
  );
}

/**
 * Walk `definition.transitions` to assemble the set of entry-point
 * descriptors to preload. In `"precise"` mode we look at the current
 * step's transitions only and read each handler's declared `targets`;
 * in `"aggressive"` mode we walk every entry referenced anywhere in the
 * map. Both skip the current step (it's already mounted).
 */
function collectPreloadTargets(
  definition: AnyJourneyDefinition,
  modules: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>,
  currentModuleId: string,
  currentEntry: string,
  mode: "precise" | "aggressive",
): readonly ModuleEntryPoint<any>[] {
  const seen = new Set<string>();
  const out: ModuleEntryPoint<any>[] = [];
  const transitions = definition.transitions as
    | Record<string, Record<string, Record<string, unknown>> | undefined>
    | undefined;
  if (!transitions) return out;

  const collectPair = (moduleId: string, entryName: string): void => {
    if (!moduleId || !entryName) return;
    if (moduleId === currentModuleId && entryName === currentEntry) return;
    // Composite key only used to dedupe. Using ` ` as the separator
    // sidesteps any collision risk with module ids that legitimately
    // contain `/` (npm-style scopes) or other punctuation.
    const seenKey = `${moduleId} ${entryName}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    const entry = modules[moduleId]?.entryPoints?.[entryName];
    if (entry) out.push(entry);
  };

  if (mode === "precise") {
    const perEntry = transitions[currentModuleId]?.[currentEntry];
    if (!perEntry) return out;
    for (const value of Object.values(perEntry)) {
      if (!isAnnotatedTransition(value)) continue;
      for (const target of value.targets) {
        // Sentinel targets (`"complete"` / `"abort"` / `"invoke"`) carry
        // no chunk to preload — they're terminal-arm declarations for the
        // type system and the catalog harvester. Skip them here.
        if (typeof target === "string") continue;
        collectPair(target.module, target.entry);
      }
    }
    return out;
  }

  // Aggressive — every (module, entry) the journey could plausibly navigate
  // to: source-side keys (covers bare-function handlers and every step that
  // has outbound transitions wired) UNIONED with the destinations declared
  // by every annotated handler (covers terminal-only destination steps —
  // entries reachable from a `next:` arm that themselves have no outbound
  // transitions yet, e.g. a freshly-added receipt screen).
  //
  // The remaining static gap — a step reachable only via `definition.start`
  // AND with no outbound transitions of its own — is left uncovered. Such a
  // step can only be the current step on first mount (you can't advance
  // away from a step with no exits), in which case the skip-current logic
  // excludes it anyway. `definition.start` is a function and we
  // deliberately don't run it speculatively.
  for (const [moduleId, perModule] of Object.entries(transitions)) {
    if (!perModule) continue;
    for (const [entryName, perExit] of Object.entries(perModule)) {
      collectPair(moduleId, entryName);
      if (!perExit) continue;
      for (const value of Object.values(perExit)) {
        if (!isAnnotatedTransition(value)) continue;
        for (const target of value.targets) {
          if (typeof target === "string") continue;
          collectPair(target.module, target.entry);
        }
      }
    }
  }
  return out;
}

function DefaultNotFound({ moduleId, entry }: JourneyOutletNotFoundProps): ReactNode {
  return createElement(
    "div",
    { style: { padding: "1rem", color: "#c53030" } },
    `Journey outlet: no entry "${moduleId}.${entry}" on the registered modules.`,
  );
}

function DefaultError({ moduleId, error }: JourneyOutletErrorProps): ReactNode {
  const message = error instanceof Error ? error.message : String(error);
  return createElement(
    "div",
    {
      style: {
        padding: "1rem",
        border: "1px solid #e53e3e",
        borderRadius: "0.5rem",
        margin: "1rem",
      },
      role: "alert",
      "data-journey-step-error": moduleId,
    },
    createElement(
      "h3",
      { style: { color: "#e53e3e", margin: "0 0 0.5rem 0" } },
      `Module "${moduleId}" encountered an error`,
    ),
    createElement(
      "pre",
      { style: { fontSize: "0.875rem", color: "#718096", whiteSpace: "pre-wrap" } },
      message,
    ),
  );
}

/**
 * Returns the call stack for an outlet's instance — root at index 0, the
 * active leaf at the end, intermediate parents in between. Useful for
 * shells that render layered presentations (e.g. parent visible
 * underneath, child in a modal): mount the parent outlet with
 * `leafOnly={false}` and the child outlet against `chain[chain.length - 1]`.
 */
export function useJourneyCallStack(
  runtime: JourneyRuntime,
  rootId: InstanceId,
): readonly InstanceId[] {
  return useCallChain(runtime, rootId, true);
}

interface StepErrorBoundaryProps {
  readonly moduleId: string;
  readonly onError: (err: unknown) => void;
  readonly errorComponent?: ComponentType<JourneyOutletErrorProps>;
  readonly children: ReactNode;
}

interface StepErrorBoundaryState {
  readonly error: unknown;
}

class StepErrorBoundary extends Component<StepErrorBoundaryProps, StepErrorBoundaryState> {
  override state: StepErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): StepErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      // Render the fallback inline. Wrapping an empty child in
      // `ModuleErrorBoundary` would not show anything: that boundary only
      // renders its fallback when *its own* child throws, and a null child
      // never does — so the outlet used to go blank after a step error.
      const ErrorFallback = this.props.errorComponent ?? DefaultError;
      return createElement(ErrorFallback, {
        moduleId: this.props.moduleId,
        error: this.state.error,
      });
    }
    return this.props.children;
  }
}
