import {
  Component,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactNode } from "react";
import type { ExitPointMap, ModuleDescriptor, ModuleEntryProps } from "@modular-react/core";

import { getInternals } from "./runtime.js";
import { useJourneyContext } from "./provider.js";
import type { InstanceId, JourneyRuntime, JourneyStep, TerminalOutcome } from "./types.js";

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
  const { exit, goBack } = internals.__bindStepCallbacks(record, reg);

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

  // The step's declared input/exit contract is erased at the module-map
  // boundary (the outlet holds ModuleDescriptor<any, any, any, any>).
  // Narrow to the structural shape every entry component satisfies —
  // `ModuleEntryProps<unknown, ExitPointMap>` — instead of `any`, so the
  // cast site at least documents the prop bag the outlet hands in.
  const StepComponent = entry.component as ComponentType<ModuleEntryProps<unknown, ExitPointMap>>;
  const stepKey = `${record.stepToken}:${retryKey}`;

  return createElement(
    StepErrorBoundary,
    {
      moduleId: step.moduleId,
      onError: handleError,
      errorComponent,
      key: stepKey,
      children: null,
    },
    createElement(StepComponent, {
      input: step.input,
      exit,
      goBack,
    }),
  );
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

function useInstanceSnapshot(runtime: JourneyRuntime, instanceId: InstanceId) {
  const subscribe = useMemo(
    () => (listener: () => void) => runtime.subscribe(instanceId, listener),
    [runtime, instanceId],
  );
  const getSnapshot = () => runtime.getInstance(instanceId);
  const getServerSnapshot = getSnapshot;
  const instance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return instance;
}

/**
 * Walk the active call chain from a root instance down to the leaf. The
 * leaf is the first instance in the chain that does not itself have an
 * `activeChildId`. Walks `activeChildId` greedily; bounded by a sanity
 * cap so a corrupted cycle (which the runtime should prevent) cannot
 * loop forever.
 *
 * Subscribes to every instance along the chain — when any link changes
 * (parent invokes a child, child resumes the parent, grandchild starts),
 * the consumer re-renders with a fresh leaf id.
 */
function useLeafId(runtime: JourneyRuntime, rootId: InstanceId, enabled: boolean): InstanceId {
  // Chain of instance ids root → … → leaf. Recomputed on every render so
  // changes to any link mid-chain take effect on the next snapshot read.
  const chain = useCallChain(runtime, rootId, enabled);
  return chain[chain.length - 1] ?? rootId;
}

/**
 * Returns the call stack for an outlet's instance — root at index 0, the
 * active leaf at the end, intermediate parents in between. Useful for
 * shells that render layered presentations (e.g. parent visible
 * underneath, child in a modal): mount the parent outlet with
 * `leafOnly={false}` and the child outlet against `chain[chain.length - 1]`.
 *
 * Subscribes to every instance in the chain so the array re-resolves
 * when the chain shifts. Length is at least 1 (the root) for any
 * registered instance.
 */
export function useJourneyCallStack(
  runtime: JourneyRuntime,
  rootId: InstanceId,
): readonly InstanceId[] {
  return useCallChain(runtime, rootId, true);
}

/**
 * Shared chain-walker used by both `useLeafId` (which takes the last
 * element) and `useJourneyCallStack` (which takes the whole array).
 * Subscribes to every instance along the way and re-subscribes
 * whenever the chain shifts so deep transitions still trigger snapshot
 * reads.
 */
// Sanity bound to break a corrupted cycle in the activeChild graph; legitimate
// invoke nesting is not expected to approach this depth. If a real product
// stacks deeper, surface this through `JourneyRuntimeOptions` rather than
// raising the constant blindly.
const MAX_CHAIN_DEPTH = 64;

function useCallChain(
  runtime: JourneyRuntime,
  rootId: InstanceId,
  enabled: boolean,
): readonly InstanceId[] {
  // useSyncExternalStore over a virtual "chain" store: subscribe to each
  // instance the chain currently traverses, return a frozen-per-render
  // array on snapshot read. The chain can shift while we're subscribed
  // (a leaf invokes a grandchild, mid-chain instance terminates) — when
  // that happens, `fire` re-walks the chain and tops up subscriptions
  // for any newly-reachable instance, so deep transitions still surface.
  const subscribe = useMemo(
    () => (listener: () => void) => {
      const unsubs = new Map<InstanceId, () => void>();
      let stopped = false;
      const fire = () => {
        if (stopped) return;
        // The chain may have grown — top up subscriptions before notifying.
        // This keeps `useJourneyCallStack` correct for chains beyond depth
        // 1 without paying for unnecessary work: only newly-reachable ids
        // call into `runtime.subscribe`.
        rewire();
        listener();
      };
      const rewire = () => {
        const seen = new Set<InstanceId>();
        let id: InstanceId | null = rootId;
        let depth = 0;
        while (id && depth < MAX_CHAIN_DEPTH) {
          if (seen.has(id)) break;
          seen.add(id);
          if (!unsubs.has(id)) {
            unsubs.set(id, runtime.subscribe(id, fire));
          }
          const inst = runtime.getInstance(id);
          id = enabled && inst ? inst.activeChildId : null;
          depth += 1;
        }
        // Drop subscriptions for ids no longer in the chain.
        for (const [subscribedId, unsub] of unsubs) {
          if (!seen.has(subscribedId)) {
            unsub();
            unsubs.delete(subscribedId);
          }
        }
      };
      rewire();
      return () => {
        stopped = true;
        for (const unsub of unsubs.values()) unsub();
        unsubs.clear();
      };
    },
    [runtime, rootId, enabled],
  );
  const getSnapshot = () => resolveChain(runtime, rootId, enabled);
  // External-store snapshots must be referentially stable across reads
  // when nothing has changed. `resolveChain` returns a fresh array every
  // call, so we cache by rootId+enabled and re-issue when the joined-id
  // signature changes — the same trick the runtime uses for instance
  // snapshots via `revision`.
  const cacheRef = useRef<{ key: string; chain: readonly InstanceId[] } | null>(null);
  const getStableSnapshot = () => {
    const fresh = getSnapshot();
    const key = fresh.join(">");
    if (cacheRef.current && cacheRef.current.key === key) return cacheRef.current.chain;
    cacheRef.current = { key, chain: fresh };
    return fresh;
  };
  return useSyncExternalStore(subscribe, getStableSnapshot, getStableSnapshot);
}

function resolveChain(
  runtime: JourneyRuntime,
  rootId: InstanceId,
  enabled: boolean,
): readonly InstanceId[] {
  const chain: InstanceId[] = [];
  let id: InstanceId | null = rootId;
  let depth = 0;
  const visited = new Set<InstanceId>();
  while (id && depth < MAX_CHAIN_DEPTH) {
    if (visited.has(id)) break; // Defensive: bail on cycle.
    visited.add(id);
    chain.push(id);
    const inst = runtime.getInstance(id);
    id = enabled && inst ? inst.activeChildId : null;
    depth += 1;
  }
  return chain;
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
