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
  ZoneDescriptor,
  ZoneResolution,
} from "./types.js";

/** Default cap on automatic retries before a zone falls back. */
const DEFAULT_RETRY_CAP = 2;

/**
 * Set of composition instance ids currently rendering in the React
 * ancestor chain. Used to short-circuit a composition that would otherwise
 * mount itself as a descendant (e.g. composition C hosts journey J whose
 * step renders `<CompositionOutlet instanceId={cId}>` for the same id),
 * which would otherwise infinite-loop into a stack overflow. The check
 * is by instance id, not composition id, so two parallel instances of
 * the same composition definition still work normally.
 *
 * The detection is partial across the journey ↔ composition boundary:
 * `@modular-react/journeys` runs its own parent-link cycle check for
 * journey-to-journey invocations, but it does not see composition
 * ancestors. A composition ↔ journey ↔ composition cycle that resolves
 * to the same composition instance is caught here; a cycle through
 * different instance ids of the same definition is not. Authors
 * encountering that case should restructure to share a single instance
 * (and the in-ancestor check then catches the recursion).
 */
const CompositionAncestryContext = createContext<ReadonlySet<CompositionInstanceId> | null>(null);

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
 */
function useInstanceSnapshot(
  runtime: CompositionRuntime,
  instanceId: CompositionInstanceId,
): CompositionInstance | null {
  return useSyncExternalStore(
    (cb) => runtime.subscribe(instanceId, cb),
    () => runtime.getInstance(instanceId),
    () => runtime.getInstance(instanceId),
  );
}

/**
 * Stable input hash used to dedupe lazy journey-zone instance ids.
 * Tolerates non-JSON-serializable input (cycles, functions) by falling
 * back to a stringified type tag — duplicates of unhashable input land
 * in the same bucket, which is the conservative choice (one journey
 * instance instead of N).
 *
 * Object keys are sorted before stringification so two selectors that
 * spell the same input with different key insertion order (`{a, b}`
 * vs `{b, a}`) produce identical hashes — otherwise the cache would
 * needlessly mint a fresh instance on every re-render that reordered
 * the spread.
 */
function hashInput(input: unknown): string {
  if (input === undefined) return "u";
  try {
    return JSON.stringify(input, stableReplacer());
  } catch {
    return `<${typeof input}>`;
  }
}

function stableReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value;
    if (seen.has(value as object)) return "<cycle>";
    seen.add(value as object);
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = (value as Record<string, unknown>)[k];
    return out;
  };
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

  // Cycle guard: a composition trying to mount itself as a descendant
  // (typically through a journey hosted in one of its own zones) would
  // recurse forever. Bail out with a clear error fallback instead.
  const ancestry = useContext(CompositionAncestryContext);
  const cycleDetected = ancestry?.has(instanceId) ?? false;
  const extendedAncestry = useMemo(() => {
    const next = new Set(ancestry ?? []);
    next.add(instanceId);
    return next;
  }, [ancestry, instanceId]);

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
  const eagerSignature = useMemo(() => {
    if (!reg || !instance || instance.status !== "active") return "";
    const zones = reg.definition.zones as Record<string, ZoneDescriptor<any, any>>;
    const parts: string[] = [];
    for (const zoneName of zoneNames) {
      const descriptor = zones[zoneName];
      if (descriptor?.preload !== "eager") continue;
      let selection: ZoneResolution<any>;
      try {
        selection = descriptor.select({ state: instance.state, deps: internals.__deps });
      } catch {
        parts.push(`${zoneName}:err`);
        continue;
      }
      parts.push(`${zoneName}:${computeSelectionKey(selection, null, modules)}`);
    }
    return parts.join("|");
  }, [reg, instance, zoneNames, modules, internals]);

  useEffect(() => {
    if (!reg || !instance || instance.status !== "active") return;
    if (eagerSignature === "") return;
    const eagerZones: Array<{ zoneName: string; descriptor: ZoneDescriptor<any, any> }> = [];
    const zones = reg.definition.zones as Record<string, ZoneDescriptor<any, any>>;
    for (const zoneName of zoneNames) {
      const descriptor = zones[zoneName];
      if (descriptor?.preload === "eager") {
        eagerZones.push({ zoneName, descriptor });
      }
    }
    if (eagerZones.length === 0) return;

    let cancelled = false;
    const run = (): void => {
      if (cancelled) return;
      for (const { zoneName, descriptor } of eagerZones) {
        let selection: ZoneResolution<any>;
        try {
          selection = descriptor.select({ state: instance.state, deps: internals.__deps });
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
  }, [reg, instance, eagerSignature, zoneNames, modules, internals]);

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
  if (!instance) return null;
  if (instance.status === "disposed") return null;

  if (!reg) {
    return <DefaultNotFound zone="<all>" moduleId={compositionId} entry="(unknown composition)" />;
  }

  // Build the zone map: each entry is a fully-wrapped renderable element.
  const zoneElements: Record<string, ReactNode> = {};
  for (const zoneName of zoneNames) {
    const descriptor = (reg.definition.zones as Record<string, ZoneDescriptor<any, any>>)[zoneName];
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
  readonly descriptor: ZoneDescriptor<any, any>;
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
  const record = internals.__getRecord(instanceId);
  const store = record?.store;
  const state = useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => (store ? store.getState() : null),
    () => (store ? store.getState() : null),
  );

  // Per-resolution journey instance cache. Without it, the JourneyOutlet
  // path mints a fresh `ji_*` on every state change because the selector
  // re-runs and we call `adapter.start(handle, input)` inline. The
  // cache holds a single entry — the *current* resolution's instance
  // id, keyed on `(handle.id, hash(input))`. When the resolution
  // changes we end the previously-minted instance via the adapter so a
  // long-running composition that cycles through many distinct inputs
  // doesn't accumulate orphan journey instances for the lifetime of
  // the outlet.
  const journeyInstanceCache = useRef<{
    readonly key: string;
    readonly id: CompositionInstanceId;
  } | null>(null);

  // End the cached journey instance when this ZoneRenderer unmounts.
  // Otherwise the last cached entry would outlive the zone and the
  // adapter has no way to know its outlet is gone.
  useEffect(() => {
    return () => {
      const cached = journeyInstanceCache.current;
      if (!cached) return;
      const adapter = runtime.getMountAdapter("journey");
      adapter?.end?.(cached.id);
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
  let selection: ZoneResolution<any> = { kind: "empty" };
  let selectorError: unknown = null;
  if (record && store && state !== null) {
    try {
      selection = descriptor.select({ state: state as unknown, deps: internals.__deps });
    } catch (err) {
      selectorError = err;
    }
  }
  const selectionKey = computeSelectionKey(selection, selectorError, modules);

  // Phase 2: side-effect — reset retry counter when the resolution
  // changes successfully. Effect-only so a discarded concurrent render
  // never mutates runtime state.
  useEffect(() => {
    const prev = previousSelectionKeyRef.current;
    if (prev !== null && prev !== selectionKey) {
      internals.__resetRetry(instanceId, zone);
    }
    previousSelectionKeyRef.current = selectionKey;
  }, [internals, instanceId, zone, selectionKey]);

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
      }
      // budget exhausted — fall through to the boundary's fallback UI
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
          // Roll over: end the previously-cached instance (if any) before
          // minting a fresh one. The adapter's `end` is optional; when
          // absent we let the embedded runtime handle teardown by its own
          // rules (typically: its outlet unmounts on next commit).
          if (cached) adapter.end?.(cached.id);
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
  selection: ZoneResolution<any>,
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

// Panels rendered inside compositions don't have a direct exit channel —
// the no-op stub lets ModuleEntryProps stay structurally satisfied while
// the panel dispatches through `useCompositionDispatch` instead.
const NOOP_EXIT = (() => {
  // Intentionally empty; foreign panels that try to call `exit()` will get
  // a silent no-op rather than a crash. Authors who want exit-style
  // behavior should call `useCompositionEmit({ kind: 'exit', payload })`.
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
