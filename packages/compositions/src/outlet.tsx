import {
  Component,
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactNode } from "react";
import { isDevEnv } from "@modular-react/core";
import type { ModuleDescriptor } from "@modular-react/core";
import { resolveEntryComponent } from "@modular-react/react";

import { getInternals } from "./runtime.js";
import { useCompositionsContext } from "./provider.js";
import { CompositionInstanceContext } from "./hooks.js";
import type { CompositionContextValue } from "./hooks.js";
import type {
  CompositionInstance,
  CompositionInstanceId,
  CompositionRuntime,
  CompositionZoneEvent,
  CompositionZoneDescriptor,
  CompositionZoneResolution,
} from "./types.js";
import {
  createCompositionZoneStores,
  noopCompositionZoneStores,
  type CompositionZoneStores,
} from "./stores.js";

/** Default cap on automatic retries before a zone falls back. */
const DEFAULT_RETRY_CAP = 2;

/**
 * Hard cap on how deep a composition definition can nest inside
 * itself before we treat the chain as a cycle. Bound on the upper end
 * of any plausible real-world layout (sub-editors etc. tend to be 2-3
 * deep). Anything beyond is almost certainly a journey ↔ composition
 * loop that bounces through *different* instance ids of the same
 * definition — same logical recursion the same-instance guard catches,
 * just laundered through fresh ids.
 */
const DEFAULT_DEFINITION_DEPTH_CAP = 8;

/**
 * Composition ancestry tracked in the React tree:
 *   - `instances` — instance ids currently rendering above this outlet.
 *     A hit here is treated as a hard cycle (we render the error
 *     fallback in place of the offending outlet) because the
 *     composition would otherwise infinite-loop into a stack overflow.
 *   - `definitionDepth` — number of times each composition id appears
 *     in the chain regardless of instance id. Two parallel instances
 *     of the same definition (e.g. side-by-side documents) is a
 *     legitimate pattern and stays under the depth cap; a
 *     journey↔composition loop that re-opens the same definition under
 *     a fresh id every iteration hits the cap quickly and produces
 *     the error fallback instead of a stack overflow.
 *
 * The detection is partial across the journey ↔ composition boundary:
 * `@modular-react/journeys` runs its own parent-link cycle check for
 * journey-to-journey invocations, but it does not see composition
 * ancestors. The same-instance guard catches the trivial case; the
 * depth-cap guard catches the cross-instance variant.
 */
interface CompositionAncestry {
  readonly instances: ReadonlySet<CompositionInstanceId>;
  readonly definitionDepth: ReadonlyMap<string, number>;
}
const CompositionAncestryContext = createContext<CompositionAncestry | null>(null);

export interface CompositionOutletNotFoundProps {
  readonly zone: string;
  readonly moduleId: string;
  readonly entry: string;
}

export interface CompositionOutletErrorProps {
  readonly zone: string;
  readonly error: unknown;
}

export interface CompositionOutletProps<TZones extends string = string> {
  /**
   * Runtime to drive the outlet against. Optional when a
   * `<CompositionsProvider>` is mounted above — the outlet reads the
   * runtime from context in that case.
   */
  readonly runtime?: CompositionRuntime;
  /** Composition id (for handle-driven mounts use `runtime.start(handle, input)` first). */
  readonly compositionId: string;
  readonly instanceId: CompositionInstanceId;
  /**
   * Module descriptors the outlet resolves panels against. Optional —
   * when omitted, falls back to the descriptors the runtime was
   * constructed with.
   */
  readonly modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  /**
   * Render-prop: receives a typed map of `{ [zoneName]: ReactNode }` —
   * one fully-wrapped element per zone (Suspense + error boundary
   * already applied). The host owns layout; the framework owns content.
   */
  readonly children: (zones: { readonly [K in TZones]: ReactNode }) => ReactNode;
  /**
   * Fallback rendered inside each zone's `Suspense` boundary while a
   * lazy entry's chunk loads. Per-entry `fallback` overrides this.
   */
  readonly loadingFallback?: ReactNode;
  readonly notFoundComponent?: ComponentType<CompositionOutletNotFoundProps>;
  readonly errorComponent?: ComponentType<CompositionOutletErrorProps>;
  /**
   * Routed to from `useCompositionEmit()` calls in any zone's panel.
   * Use for cross-zone hand-offs that don't fit through shared state.
   */
  readonly onZoneEvent?: (event: CompositionZoneEvent, ctx: { zone: string }) => void;
  /**
   * Cap on `retry` responses from `onZoneError` before the zone falls
   * back. Default: 2.
   */
  readonly retryLimit?: number;
}

/**
 * Subscribe to a composition instance. Mirrors `useInstanceSnapshot`
 * from journeys' `instance-hooks.ts` — uses `useSyncExternalStore` for
 * tearing-free reads and falls back to `null` when the instance is
 * unknown (e.g. mid-disposal).
 *
 * `subscribe` and `getSnapshot` are stabilized via `useCallback` so
 * React doesn't observe a fresh function identity on every render and
 * re-run its subscribe/unsubscribe dance — each unsubscribe goes
 * through the runtime's disposal microtask gate, so churn is wasted
 * work and (transiently) makes the listener count look like 0.
 */
function useInstanceSnapshot(
  runtime: CompositionRuntime,
  instanceId: CompositionInstanceId,
): CompositionInstance | null {
  const subscribe = useCallback(
    (cb: () => void) => runtime.subscribe(instanceId, cb),
    [runtime, instanceId],
  );
  const getSnapshot = useCallback(() => runtime.getInstance(instanceId), [runtime, instanceId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Stable input hash used to dedupe lazy journey-zone instance ids and
 * to key per-input boundaries in module-entry resolutions.
 *
 * Properties:
 *   - Object keys are sorted so `{a, b}` and `{b, a}` hash identically.
 *   - Shared (non-cyclic) subtrees serialize fully on every occurrence,
 *     so `{x: A, y: A}` and `{x: A_copy, y: A_copy}` hash equally when
 *     `A` and `A_copy` have the same content. (A naive `seen` WeakSet
 *     mis-flags the second visit as `<cycle>`, breaking this.)
 *   - True cycles short-circuit to `<cycle>` so we never infinite-loop.
 *   - Functions and non-serializable leaves (e.g. BigInt) serialize as
 *     `<fn>` / `<bigint:…>` so they don't trip JSON.stringify.
 *   - Unhashable input (final catch-all) falls back to a typeof tag —
 *     duplicates land in the same bucket, the conservative choice.
 */
/**
 * Dispatch placeholder for selector invocations on the preload path.
 * Preload only reads `module`/`entry` off the resulting resolution; any
 * `dispatch`-driven callbacks the selector bakes into `input` are never
 * invoked from preload, so a stable no-op is correct here. Shared (not
 * inlined) so identity-equality across preload runs doesn't fluctuate.
 */
const noopDispatch: (updater: unknown) => void = () => {};

/**
 * Stores placeholder for selector invocations on the preload path.
 * Same rationale as {@link noopDispatch} — preload never invokes any
 * store baked into `input`, so a stub provider is correct and avoids
 * holding a real runtime + instance handle on a path that doesn't
 * need them. Cast to widen `unknown` → `any` so the unified noop
 * satisfies the per-`TState` `CompositionZoneStores` contract.
 */
const noopStores = noopCompositionZoneStores as unknown as CompositionZoneStores<any>;

function hashInput(input: unknown): string {
  if (input === undefined) return "u";
  try {
    return serializeStable(input, new Set());
  } catch {
    return `<${typeof input}>`;
  }
}

function serializeStable(value: unknown, ancestors: Set<object>): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") {
    const n = value as number;
    if (Number.isFinite(n)) return String(n);
    // Use distinct sentinels so NaN / +Infinity / -Infinity all hash
    // differently — `JSON.stringify(NaN)` would collapse them all to
    // `"null"` and a cache keyed on the hash would falsely treat
    // them as the same input.
    if (Number.isNaN(n)) return '"<nan>"';
    return n > 0 ? '"<+inf>"' : '"<-inf>"';
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t === "bigint") return `"<bigint:${(value as bigint).toString()}>"`;
  if (t === "function" || t === "symbol") return `"<${t}>"`;
  if (t !== "object") return JSON.stringify(value);
  const obj = value as object;
  if (ancestors.has(obj)) return '"<cycle>"';
  ancestors.add(obj);
  try {
    if (Array.isArray(value)) {
      const items = (value as readonly unknown[]).map((v) => serializeStable(v, ancestors));
      return `[${items.join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(k)}:${serializeStable(record[k], ancestors)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    ancestors.delete(obj);
  }
}

/**
 * Renders a composition instance. Host-agnostic — works in a route
 * Component, a tab, a modal, or any plain container. On unmount while
 * the instance has no other listeners, the instance is disposed
 * (deferred by a microtask so StrictMode's simulated mount cycle does
 * not tear it down on first visit).
 */
export function CompositionOutlet<TZones extends string = string>(
  props: CompositionOutletProps<TZones>,
): ReactNode {
  const context = useCompositionsContext();
  const {
    runtime: runtimeProp,
    compositionId,
    instanceId,
    modules: modulesProp,
    children,
    loadingFallback,
    notFoundComponent,
    errorComponent,
    onZoneEvent,
    retryLimit = DEFAULT_RETRY_CAP,
  } = props;

  const runtime = runtimeProp ?? context?.runtime;
  if (!runtime) {
    throw new Error(
      "[@modular-react/compositions] <CompositionOutlet> needs a runtime. Either pass `runtime` or mount a <CompositionsProvider>.",
    );
  }

  // Cycle guard. Two checks:
  //   1. Same instance id already in the ancestry → trivial cycle
  //      (a panel rendering an outlet for the same id it's hosted
  //      inside). Hard fail, render the error fallback.
  //   2. Same composition id appearing more times than the depth cap
  //      → cross-instance cycle, typically a journey that re-opens
  //      the composition under a fresh instance id every hop. The
  //      hops use different ids so the instance check misses them,
  //      but the definition depth grows without bound until the
  //      stack does. Hard fail at the cap.
  const ancestry = useContext(CompositionAncestryContext);
  const cycleDetected = ancestry?.instances.has(instanceId) ?? false;
  const currentDefinitionDepth = ancestry?.definitionDepth.get(compositionId) ?? 0;
  const definitionCycleDetected =
    !cycleDetected && currentDefinitionDepth >= DEFAULT_DEFINITION_DEPTH_CAP;
  const extendedAncestry = useMemo<CompositionAncestry>(() => {
    const instances = new Set(ancestry?.instances ?? []);
    instances.add(instanceId);
    const definitionDepth = new Map(ancestry?.definitionDepth ?? []);
    definitionDepth.set(compositionId, (definitionDepth.get(compositionId) ?? 0) + 1);
    return { instances, definitionDepth };
  }, [ancestry, instanceId, compositionId]);

  const instance = useInstanceSnapshot(runtime, instanceId);
  const internals = getInternals(runtime);
  const modules = modulesProp ?? internals.__moduleMap;

  // Attach / detach: increments outletRefCount; the runtime disposes the
  // instance when it drops to 0 with no listeners. Deferred via microtask
  // inside `__detach` so StrictMode's mount/unmount/mount dance leaves the
  // instance alive.
  useEffect(() => {
    if (cycleDetected) return;
    internals.__attach(instanceId);
    return () => {
      internals.__detach(instanceId);
    };
  }, [internals, instanceId, cycleDetected]);

  const reg = internals.__getRegistered(compositionId);
  const zoneNames = useMemo<readonly string[]>(() => {
    if (!reg) return [];
    return Object.keys(reg.definition.zones);
  }, [reg]);

  // Eager preload: when a zone declares `preload: "eager"`, warm the
  // chunk of whatever module-entry its selector returns RIGHT NOW.
  //
  // Cheap reactivity gate: derive a single string that flips ONLY when
  // an eager zone's resolution changes. State updates that don't alter
  // any eager zone's resolution (e.g. an unrelated counter increment)
  // produce an identical signature and the effect's identity-comparison
  // short-circuits — no idle-callback churn for noisy state.
  //
  // Skip the prep entirely when no zone is eager (the common case);
  // otherwise re-run the prep for every dispatch even though nothing
  // could ever preload from it.
  const eagerZoneNames = useMemo<readonly string[]>(() => {
    if (!reg) return [];
    const zones = reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>;
    const names: string[] = [];
    for (const zoneName of zoneNames) {
      if (zones[zoneName]?.preload === "eager") names.push(zoneName);
    }
    return names;
  }, [reg, zoneNames]);
  const hasEagerZones = eagerZoneNames.length > 0;

  // Gate the signature's instance-shaped dep on `hasEagerZones`. When
  // no zone declares `preload: "eager"`, the dep is a constant `null`
  // across renders so the memo's identity check short-circuits even
  // though `instance` itself changes on every dispatch. Without this,
  // the memo body re-allocates a closure per dispatch even when
  // nothing could ever preload from it.
  const eagerSignatureInput = hasEagerZones ? instance : null;
  const eagerSignature = useMemo(() => {
    if (!hasEagerZones) return "";
    if (!reg || !eagerSignatureInput || eagerSignatureInput.status !== "active") return "";
    const zones = reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>;
    const parts: string[] = [];
    for (const zoneName of eagerZoneNames) {
      const descriptor = zones[zoneName];
      if (!descriptor) continue;
      let selection: CompositionZoneResolution<any>;
      try {
        selection = descriptor.select({
          state: eagerSignatureInput.state,
          deps: internals.__deps,
          // Preload paths only inspect `module`/`entry` on the
          // resolution — they never invoke any callback the selector
          // may have baked into `input`. No-op `dispatch` + `stores`
          // are correct here.
          dispatch: noopDispatch,
          stores: noopStores,
        });
      } catch {
        parts.push(`${zoneName}:err`);
        continue;
      }
      parts.push(`${zoneName}:${computeSelectionKey(selection, null, modules)}`);
    }
    return parts.join("|");
  }, [reg, eagerSignatureInput, hasEagerZones, eagerZoneNames, modules, internals]);

  useEffect(() => {
    if (!hasEagerZones) return;
    if (!reg || !instance || instance.status !== "active") return;
    if (eagerSignature === "") return;
    const zones = reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>;
    const eagerZones: Array<{ zoneName: string; descriptor: CompositionZoneDescriptor<any, any> }> =
      [];
    for (const zoneName of eagerZoneNames) {
      const descriptor = zones[zoneName];
      if (descriptor) eagerZones.push({ zoneName, descriptor });
    }
    if (eagerZones.length === 0) return;

    let cancelled = false;
    const run = (): void => {
      if (cancelled) return;
      for (const { zoneName, descriptor } of eagerZones) {
        let selection: CompositionZoneResolution<any>;
        try {
          selection = descriptor.select({
            state: instance.state,
            deps: internals.__deps,
            dispatch: noopDispatch,
            stores: noopStores,
          });
        } catch {
          // Selector errors are surfaced at render time; preload is
          // best-effort, so we swallow here.
          continue;
        }
        if (selection.kind !== "module-entry") continue;
        const mod = modules[selection.module];
        const entry = mod?.entryPoints?.[selection.entry];
        if (!mod || !entry) continue;
        try {
          resolveEntryComponent(entry).preload();
        } catch {
          // Best-effort: a malformed entry would have failed validation
          // upstream. Don't let one bad zone block the rest.
          void zoneName; // explicit no-op marker for the lint-rule
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
    // `eagerSignature` is the only state-dependent identity that should
    // trigger a re-run; the other deps are stable across the lifetime
    // of an outlet and listed for ESLint hygiene only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, instance, eagerSignature, eagerZoneNames, hasEagerZones, modules, internals]);

  if (cycleDetected) {
    return renderError(
      "<all>",
      new Error(
        `[@modular-react/compositions] Composition instance "${instanceId}" is already in the render ancestry — refusing to mount it as a descendant. ` +
          `This is usually caused by a zone hosting a journey whose step renders the same composition instance.`,
      ),
      errorComponent,
    );
  }
  if (definitionCycleDetected) {
    return renderError(
      "<all>",
      new Error(
        `[@modular-react/compositions] Composition "${compositionId}" has nested inside itself ${DEFAULT_DEFINITION_DEPTH_CAP} times — refusing to recurse further. ` +
          `This usually means a zone is hosting a journey whose step re-opens the same composition under a fresh instance id each hop. ` +
          `Restructure to share a single composition instance (the same-instance guard will then catch the recursion) or break the loop in the journey definition.`,
      ),
      errorComponent,
    );
  }
  if (!instance) return null;
  if (instance.status === "disposed") return null;

  if (!reg) {
    return <DefaultNotFound zone="<all>" moduleId={compositionId} entry="(unknown composition)" />;
  }

  // Build the zone map: each entry is a fully-wrapped renderable element.
  const zoneElements: Record<string, ReactNode> = {};
  for (const zoneName of zoneNames) {
    const descriptor = (
      reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>
    )[zoneName];
    zoneElements[zoneName] = (
      <ZoneRenderer
        key={zoneName}
        runtime={runtime}
        compositionId={compositionId}
        instanceId={instanceId}
        zone={zoneName}
        descriptor={descriptor}
        modules={modules}
        loadingFallback={loadingFallback}
        notFoundComponent={notFoundComponent}
        errorComponent={errorComponent}
        onZoneEvent={onZoneEvent}
        retryLimit={retryLimit}
      />
    );
  }

  return (
    <CompositionAncestryContext.Provider value={extendedAncestry}>
      {children(zoneElements as { readonly [K in TZones]: ReactNode })}
    </CompositionAncestryContext.Provider>
  );
}

interface ZoneRendererProps {
  readonly runtime: CompositionRuntime;
  readonly compositionId: string;
  readonly instanceId: CompositionInstanceId;
  readonly zone: string;
  readonly descriptor: CompositionZoneDescriptor<any, any>;
  readonly modules: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  readonly loadingFallback?: ReactNode;
  readonly notFoundComponent?: ComponentType<CompositionOutletNotFoundProps>;
  readonly errorComponent?: ComponentType<CompositionOutletErrorProps>;
  readonly onZoneEvent?: (event: CompositionZoneEvent, ctx: { zone: string }) => void;
  readonly retryLimit: number;
}

function ZoneRenderer(props: ZoneRendererProps): ReactNode {
  const {
    runtime,
    compositionId,
    instanceId,
    zone,
    descriptor,
    modules,
    loadingFallback,
    notFoundComponent,
    errorComponent,
    onZoneEvent,
    retryLimit,
  } = props;
  const internals = getInternals(runtime);
  const [retryKey, setRetryKey] = useState(0);
  // Sentinel that flips when handleError decides to render `null` instead
  // of the error fallback (policy === "ignore"). Keyed by selectionKey so
  // a later resolution that errors gets its own decision.
  const [ignoredSelectionKey, setIgnoredSelectionKey] = useState<string | null>(null);

  // Subscribe to the composition's store so the zone re-runs its selector
  // on every state change. The store lives on the instance record. The
  // getSnapshot result is null-tolerant — if the record disappears
  // mid-disposal, the null short-circuits the selector path below.
  //
  // `subscribeState` / `getStateSnapshot` are stabilized so React
  // doesn't see a fresh subscribe identity on every render. Without
  // it, every parent re-render churns an underlying-store subscribe/
  // unsubscribe pair.
  const record = internals.__getRecord(instanceId);
  const store = record?.store;
  const subscribeState = useCallback(
    (cb: () => void) => (store ? store.subscribe(cb) : () => {}),
    [store],
  );
  const getStateSnapshot = useCallback(() => (store ? store.getState() : null), [store]);
  const state = useSyncExternalStore(subscribeState, getStateSnapshot, getStateSnapshot);

  // Per-resolution journey instance cache. Without it, the JourneyOutlet
  // path mints a fresh `ji_*` on every state change because the selector
  // re-runs and we call `adapter.start(handle, input)` inline. The
  // cache holds a single entry — the *current* resolution's instance
  // id, keyed on `(handle.id, hash(input))`. When the resolution
  // changes we end the previously-minted instance via the adapter so a
  // long-running composition that cycles through many distinct inputs
  // doesn't accumulate orphan journey instances for the lifetime of
  // the outlet.
  //
  // `adapter.start` runs during render and is idempotent per fiber via
  // this ref. `adapter.end`, however, is a *destructive* side effect
  // against a foreign runtime — calling it from render risks tearing
  // down an instance the committed UI is still showing (a discarded
  // concurrent render that rolled over would otherwise end an id the
  // previous committed render is still mounting). End calls are queued
  // here and drained from a commit-time effect (`journeyEndEffect`
  // below) so only committed renders' rollovers actually end their
  // predecessors.
  const journeyInstanceCache = useRef<{
    readonly key: string;
    readonly id: CompositionInstanceId;
  } | null>(null);
  const journeyEndQueue = useRef<CompositionInstanceId[]>([]);

  // Drain the end-queue after every commit. Any rolled-over journey
  // ids accumulated by the latest committed render get ended here,
  // safely outside the render path. If no `end` adapter is registered
  // the queue is cleared anyway (the foreign runtime is on its own).
  useEffect(() => {
    const queue = journeyEndQueue.current;
    if (queue.length === 0) return;
    const adapter = runtime.getMountAdapter("journey");
    const endFn = adapter?.end;
    if (endFn) {
      for (const id of queue) endFn(id);
    }
    queue.length = 0;
  });

  // End the cached journey instance when this ZoneRenderer unmounts.
  // Otherwise the last cached entry would outlive the zone and the
  // adapter has no way to know its outlet is gone. Also drains any
  // ids still parked in the end-queue (a render that rolled over and
  // then unmounted before the drain effect fired).
  useEffect(() => {
    return () => {
      const adapter = runtime.getMountAdapter("journey");
      const endFn = adapter?.end;
      if (endFn) {
        for (const id of journeyEndQueue.current) endFn(id);
        const cached = journeyInstanceCache.current;
        if (cached) endFn(cached.id);
      }
      journeyEndQueue.current = [];
      journeyInstanceCache.current = null;
    };
  }, [runtime]);

  // Stable callbacks so foreign panels reading useCompositionDispatch /
  // useCompositionEmit don't re-render on every parent re-render.
  const dispatch = useCallback(
    (updater: unknown) => {
      runtime.dispatch(instanceId, updater as never);
    },
    [runtime, instanceId],
  );
  // Stable `stores` provider per `(runtime, instanceId)`. Selectors call
  // `stores.readable(key, ...)` / `stores.writable(key, ...)` to project
  // composition state into typed store contracts that panels consume
  // via their `input`. Identity is stable across selector re-runs
  // within this outlet mount, which is what `useSyncExternalStore` in
  // the panel needs to avoid re-subscribing.
  const stores = useMemo(
    () => createCompositionZoneStores<unknown>(runtime, instanceId),
    [runtime, instanceId],
  );
  const emit = useCallback(
    (event: CompositionZoneEvent) => {
      try {
        onZoneEvent?.(event, { zone });
      } catch (err) {
        // Emit is invoked from event handlers, not render — label the
        // phase accordingly so shell telemetry can split user-action
        // failures from render/select ones.
        internals.__fireOnError(instanceId, err, { zone, phase: "emit" });
      }
    },
    [internals, instanceId, onZoneEvent, zone],
  );

  // Build the context value with a stable identity so panels using
  // useCompositionDispatch / useCompositionEmit don't re-render on every
  // composition-state change. The state itself is read separately via
  // `useCompositionState(selector)`.
  const contextValue = useMemo<CompositionContextValue>(
    () => ({
      runtime,
      compositionId,
      instanceId,
      zone,
      // Cast: the context type erases TState to unknown so the same
      // context can carry stores of different shapes. Panels narrow via
      // their useCompositionState selector.
      store: store as unknown as CompositionContextValue["store"],
      dispatch: dispatch as CompositionContextValue["dispatch"],
      emit,
    }),
    [runtime, compositionId, instanceId, zone, store, dispatch, emit],
  );

  // Tracks the previous render's selectionKey so we can detect a
  // resolution change and reset the per-zone retry counter in a commit-
  // time effect (mutating runtime state during render is unsafe in
  // concurrent React — a discarded render would still reset the counter).
  const previousSelectionKeyRef = useRef<string | null>(null);
  // Read by the boundary's componentDidCatch via `handleError`. Set
  // synchronously below (just before render) so the value is current at
  // commit time; the effect-driven `previousSelectionKeyRef` would still
  // be one render behind when `componentDidCatch` fires.
  const selectionKeyForErrorRef = useRef<string>("empty");

  // Phase 1: derive the resolution + a deterministic selection key.
  // Both have to be computed before the effect declared below, so the
  // effect's `selectionKey` dep is stable across renders.
  let selection: CompositionZoneResolution<any> = { kind: "empty" };
  let selectorError: unknown = null;
  if (record && store && state !== null) {
    try {
      selection = descriptor.select({
        state: state as unknown,
        deps: internals.__deps,
        // Stable `dispatch` + `stores` references (memoized above keyed
        // on `[runtime, instanceId]`). Callbacks and store references
        // the selector closes over these with stay identity-stable
        // across re-renders, so panels using `useSyncExternalStore`
        // don't re-subscribe and `React.memo`'d panels don't churn.
        dispatch,
        stores,
      });
    } catch (err) {
      selectorError = err;
    }
  }
  const selectionKey = computeSelectionKey(selection, selectorError, modules);

  // Phase 2: side-effect — when the resolution changes, reset both the
  // per-zone retry counter and any sticky `"ignore"` decision the
  // previous resolution set. Effect-only so a discarded concurrent
  // render never mutates runtime state.
  //
  // Why ignoredSelectionKey lives here: without resetting, a panel that
  // failed once under the ignore policy would keep rendering `null` if
  // its selectionKey ever recurred after a detour. Clearing on
  // resolution change scopes the suppression to the specific resolution
  // the host marked ignorable.
  useEffect(() => {
    const prev = previousSelectionKeyRef.current;
    if (prev !== null && prev !== selectionKey) {
      internals.__resetRetry(instanceId, zone);
      if (ignoredSelectionKey !== null && ignoredSelectionKey !== selectionKey) {
        setIgnoredSelectionKey(null);
      }
    }
    previousSelectionKeyRef.current = selectionKey;
  }, [internals, instanceId, zone, selectionKey, ignoredSelectionKey]);

  if (!record || !store) return null;

  if (selectorError) {
    internals.__fireOnError(instanceId, selectorError, { zone, phase: "select" });
    return renderError(zone, selectorError, errorComponent);
  }

  // Mutate the ref synchronously just before render so the boundary's
  // `componentDidCatch` (which fires during the commit phase, before
  // any post-commit effect) sees the current selectionKey. Ref writes
  // in render are a documented escape hatch; the only effect of a
  // discarded concurrent render is that the next render overwrites
  // the value before `handleError` ever runs.
  selectionKeyForErrorRef.current = selectionKey;
  const currentState = state as unknown;

  const handleError = (err: unknown): void => {
    internals.__fireOnError(instanceId, err, { zone, phase: "render" });
    const reg = internals.__getRegistered(compositionId);
    const policy =
      reg?.definition.onZoneError?.(err, { zone, instanceId, state: currentState }) ?? "fallback";
    if (policy === "retry") {
      if (internals.__consumeRetry(instanceId, zone, retryLimit)) {
        setRetryKey((k) => k + 1);
        return;
      }
      // Budget exhausted — surface a distinct phase so shell telemetry
      // can split "retried successfully" from "host asked for retries
      // but ran out". The boundary's fallback UI still renders below.
      internals.__fireOnError(instanceId, err, { zone, phase: "retry-exhausted" });
      return;
    }
    if (policy === "ignore") {
      // Record the selectionKey that should render null. Once the
      // selector returns a different resolution, the new selectionKey
      // mismatches the ignored one and the boundary renders normally
      // (the next-resolution case is handled in the JSX below).
      setIgnoredSelectionKey(selectionKeyForErrorRef.current);
      return;
    }
    // "fallback" — keep the default error UI rendered.
  };

  // Build the renderable content for this resolution.
  let content: ReactNode = null;

  if (selection.kind === "empty") {
    const Fallback = descriptor.fallback;
    content = Fallback ? <Fallback /> : null;
  } else if (selection.kind === "module-entry") {
    const mod = modules[selection.module];
    const entry = mod?.entryPoints?.[selection.entry];
    if (!mod || !entry) {
      const NotFound = notFoundComponent ?? DefaultNotFound;
      content = <NotFound zone={zone} moduleId={selection.module} entry={selection.entry} />;
    } else if (!entryAllowsCompositionMount(entry)) {
      // Type-level enforcement via `CompositionZoneSpec`'s mountKinds
      // filter usually catches this. The render-time check is the
      // belt-and-braces against type-bypass paths (a selector returns
      // a dynamic id, an `as never` cast, an `any`-typed module map):
      // a journey-only entry mounted into a composition would
      // silently drop `exit` calls without it.
      content = renderError(
        zone,
        new Error(
          `[@modular-react/compositions] Entry "${selection.module}.${selection.entry}" declares ` +
            `mountKinds=${JSON.stringify(entry.mountKinds)} which does not include "composition". ` +
            `Composition zones cannot mount journey-only entries — either widen the entry's mountKinds, ` +
            `or pick a different module-entry in the selector.`,
        ),
        errorComponent,
      );
    } else {
      const { Component: PanelComponent } = resolveEntryComponent(entry);
      const suspenseFallback = entry.fallback ?? loadingFallback ?? null;
      content = (
        <Suspense fallback={suspenseFallback}>
          <PanelComponent
            input={selection.input}
            // Composition panels don't have direct exit/goBack/goForward
            // hooks — they communicate via dispatch + emit. The host's
            // module-exit dispatcher (if mounted via JourneyProvider) still
            // catches exits, but they're not delivered here directly.
            exit={NOOP_EXIT}
          />
        </Suspense>
      );
    }
  } else if (selection.kind === "journey") {
    // Look up the registered "journey" mount adapter and mint (or reuse
    // a cached) instance for the resolution's handle+input. If the
    // selector did not supply an instanceId, fall back to the per-
    // ZoneRenderer cache so the journey is idempotent on
    // (handle.id, input) regardless of whether the journey runtime has
    // persistence wired. The adapter abstracts away the journey
    // runtime — compositions stays decoupled from
    // `@modular-react/journeys` entirely.
    const adapter = runtime.getMountAdapter("journey");
    if (!adapter) {
      content = renderError(
        zone,
        new Error(
          '[@modular-react/compositions] Zone returned a `journey` resolution but no mount adapter is registered for kind "journey". ' +
            'Call `runtime.registerMountAdapter("journey", createJourneyMountAdapter(journeyRuntime))` before mounting the composition.',
        ),
        errorComponent,
      );
    } else {
      let journeyInstanceId = selection.instanceId;
      if (!journeyInstanceId) {
        const cacheKey = `${selection.handle.id}:${hashInput(selection.input)}`;
        const cached = journeyInstanceCache.current;
        if (cached && cached.key === cacheKey) {
          journeyInstanceId = cached.id;
        } else {
          // Roll over: queue the previously-cached id for end-after-
          // commit (the destructive side effect must not run during
          // render — see the `journeyEndQueue` comment above). The
          // mint itself stays in render: it's idempotent per fiber
          // via `journeyInstanceCache`, and a discarded render's
          // mint is reused by the next render attempt.
          if (cached) journeyEndQueue.current.push(cached.id);
          journeyInstanceId = adapter.start(selection.handle.id, selection.input);
          journeyInstanceCache.current = { key: cacheKey, id: journeyInstanceId };
        }
      }
      const AdapterOutlet = adapter.Outlet;
      content = <AdapterOutlet instanceId={journeyInstanceId} loadingFallback={loadingFallback} />;
    }
  }

  // Per-zone error boundary. Keyed by selectionKey + retryKey so a
  // selector change cleanly remounts a fresh boundary.
  const boundaryKey = `${selectionKey}:${retryKey}`;

  return (
    <CompositionInstanceContext.Provider value={contextValue}>
      <ZoneErrorBoundary
        key={boundaryKey}
        zone={zone}
        onError={handleError}
        errorComponent={errorComponent}
        renderNullOnError={ignoredSelectionKey === selectionKey}
      >
        {content}
      </ZoneErrorBoundary>
    </CompositionInstanceContext.Provider>
  );
}

/**
 * Pure derivation of a stable per-resolution key. Lives outside the
 * component body so the dependency lists of `useEffect` callers stay
 * obvious — the key only depends on what the function reads.
 *
 * For `journey` resolutions without an explicit `instanceId` we hash
 * the input rather than the runtime-minted id, so the key is stable
 * across the discarded/committed render boundary (the cached id may
 * not exist yet on the first attempted render).
 */
function computeSelectionKey(
  selection: CompositionZoneResolution<any>,
  selectorError: unknown,
  modules: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>,
): string {
  if (selectorError) return "select-error";
  if (selection.kind === "empty") return "empty";
  if (selection.kind === "module-entry") {
    const mod = modules[selection.module];
    const entry = mod?.entryPoints?.[selection.entry];
    // Include `input` in the key on equal terms with the journey path so
    // that an input change resets the retry counter and remounts the
    // boundary — a stale error from a previous input shouldn't survive
    // a state change that produced a different input.
    const inputSuffix = hashInput(selection.input);
    if (!mod || !entry) return `notfound:${selection.module}:${selection.entry}:${inputSuffix}`;
    return `entry:${selection.module}:${selection.entry}:${inputSuffix}`;
  }
  if (selection.kind === "journey") {
    const idSuffix = selection.instanceId ?? hashInput(selection.input);
    return `journey:${selection.handle.id}:${idSuffix}`;
  }
  return "unknown";
}

/**
 * Returns true iff the entry's `mountKinds` permits the
 * `"composition"` host. Omitted `mountKinds` defaults to "every mount
 * surface", so existing modules that never opted in still work.
 *
 * Mirrors the type-level `EntryNamesByMountKindOf` filter applied to
 * `CompositionZoneSpec`: the type-side check is the primary
 * enforcement, this is the runtime backstop against type-bypass paths
 * (any-typed module maps, dynamic ids, `as never` casts).
 */
function entryAllowsCompositionMount(entry: { readonly mountKinds?: readonly string[] }): boolean {
  if (!Array.isArray(entry.mountKinds)) return true;
  return entry.mountKinds.includes("composition");
}

// Panels rendered inside compositions don't have a direct exit channel —
// the no-op stub lets ModuleEntryProps stay structurally satisfied while
// the panel dispatches through `useCompositionDispatch` instead.
//
// Type-checks pass through `as never`, so a foreign panel (typically a
// journey-shaped one being reused here) that calls `exit("name", payload)`
// gets neither a compile error nor a crash — it just silently drops.
// To surface that footgun, we warn in dev the first time a given exit
// name is observed on this NOOP_EXIT path. Once per name keeps the
// warning useful for diagnostic and quiet under repeated user actions.
const NOOP_EXIT_WARNED = new Set<string>();
const NOOP_EXIT = ((exitName?: string) => {
  if (!isDevEnv()) return;
  const key = typeof exitName === "string" && exitName.length > 0 ? exitName : "<anonymous>";
  if (NOOP_EXIT_WARNED.has(key)) return;
  NOOP_EXIT_WARNED.add(key);
  console.warn(
    `[@modular-react/compositions] A panel mounted into a composition zone called \`exit(${JSON.stringify(key)}, …)\`. ` +
      `Composition panels don't have an exit channel — the call has been dropped. ` +
      `Use \`useCompositionDispatch\` to mutate composition state, or \`useCompositionEmit\` for cross-zone hand-offs.`,
  );
}) as never;

function renderError(
  zone: string,
  error: unknown,
  errorComponent?: ComponentType<CompositionOutletErrorProps>,
): ReactNode {
  const Fallback = errorComponent ?? DefaultError;
  return <Fallback zone={zone} error={error} />;
}

function DefaultNotFound({ zone, moduleId, entry }: CompositionOutletNotFoundProps): ReactNode {
  return (
    <div style={{ padding: "1rem", color: "#c53030" }} role="alert">
      Composition zone &quot;{zone}&quot;: no entry &quot;{moduleId}.{entry}&quot; on the registered
      modules.
    </div>
  );
}

function DefaultError({ zone, error }: CompositionOutletErrorProps): ReactNode {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div
      style={{
        padding: "1rem",
        border: "1px solid #e53e3e",
        borderRadius: "0.5rem",
        margin: "0.25rem",
      }}
      role="alert"
      data-composition-zone-error={zone}
    >
      <h4 style={{ color: "#e53e3e", margin: "0 0 0.5rem 0" }}>
        Zone &quot;{zone}&quot; encountered an error
      </h4>
      <pre style={{ fontSize: "0.875rem", color: "#718096", whiteSpace: "pre-wrap" }}>
        {message}
      </pre>
    </div>
  );
}

interface ZoneErrorBoundaryProps {
  readonly zone: string;
  readonly onError: (err: unknown) => void;
  readonly errorComponent?: ComponentType<CompositionOutletErrorProps>;
  readonly children: ReactNode;
  /**
   * When the parent has decided the current resolution's error should
   * render `null` (policy `"ignore"`), it sets this prop. The boundary
   * still catches the throw and reports via `onError`, but the visible
   * output is suppressed.
   */
  readonly renderNullOnError: boolean;
}

interface ZoneErrorBoundaryState {
  readonly error: unknown;
}

class ZoneErrorBoundary extends Component<ZoneErrorBoundaryProps, ZoneErrorBoundaryState> {
  override state: ZoneErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ZoneErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.renderNullOnError) return null;
      const Fallback = this.props.errorComponent ?? DefaultError;
      return <Fallback zone={this.props.zone} error={this.state.error} />;
    }
    return this.props.children;
  }
}
