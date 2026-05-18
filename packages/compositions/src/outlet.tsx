import {
  Component,
  Suspense,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactNode } from "react";
import type { ModuleDescriptor } from "@modular-react/core";
import { resolveEntryComponent } from "@modular-react/react";
import { JourneyOutlet, useJourneyContext } from "@modular-react/journeys";

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

  const instance = useInstanceSnapshot(runtime, instanceId);
  const internals = getInternals(runtime);
  const modules = modulesProp ?? internals.__moduleMap;

  // Attach / detach: increments outletRefCount; the runtime disposes the
  // instance when it drops to 0 with no listeners. Deferred via microtask
  // inside `__detach` so StrictMode's mount/unmount/mount dance leaves the
  // instance alive.
  useEffect(() => {
    internals.__attach(instanceId);
    return () => {
      internals.__detach(instanceId);
    };
  }, [internals, instanceId]);

  const reg = internals.__getRegistered(compositionId);
  // Capture all zone names once per definition so the rendered render-prop
  // payload is consistent across renders even while instance is loading.
  const zoneNames = useMemo<readonly string[]>(() => {
    if (!reg) return [];
    return Object.keys(reg.definition.zones);
  }, [reg]);

  if (!instance) return null;
  if (instance.status === "loading") return loadingFallback ?? null;
  if (instance.status === "disposed") return null;

  if (!reg) {
    return createElement(
      DefaultNotFound,
      { zone: "<all>", moduleId: compositionId, entry: "(unknown composition)" },
    );
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

  return children(zoneElements as { readonly [K in TZones]: ReactNode });
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
  const journeyContext = useJourneyContext();
  const [retryKey, setRetryKey] = useState(0);

  // Subscribe to the composition's store so the zone re-runs its selector
  // on every state change. The store lives on the instance record.
  const record = internals.__getRecord(instanceId);
  const store = record?.store;
  const state = useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => store?.getState(),
    () => store?.getState(),
  );

  if (!record || !store) return null;

  // Run the selector. Catch throws so a bad selector aborts the zone, not
  // the whole composition.
  let selection: ZoneResolution<any> = { kind: "empty" };
  try {
    selection = descriptor.select({ state, deps: internals.__deps });
  } catch (err) {
    internals.__fireOnError(instanceId, err, { zone, phase: "select" });
    return renderError(zone, err, errorComponent);
  }

  // Build the context value once per render. Foreign panels read it via
  // useCompositionState / useCompositionDispatch / useCompositionEmit.
  const contextValue: CompositionContextValue = {
    runtime,
    compositionId,
    instanceId,
    zone,
    store,
    dispatch: (updater) => {
      runtime.dispatch(instanceId, updater as never);
    },
    emit: (event) => {
      try {
        onZoneEvent?.(event, { zone });
      } catch (err) {
        internals.__fireOnError(instanceId, err, { zone, phase: "render" });
      }
    },
  };

  const handleError = (err: unknown): void => {
    internals.__fireOnError(instanceId, err, { zone, phase: "render" });
    const reg = internals.__getRegistered(compositionId);
    const policy = reg?.definition.onZoneError?.(err, { zone, instanceId, state }) ?? "fallback";
    if (policy === "retry") {
      if (internals.__consumeRetry(instanceId, zone, retryLimit)) {
        setRetryKey((k) => k + 1);
      }
      // budget exhausted — fall through to the boundary's fallback UI
    }
    // "fallback" and "ignore" both leave the boundary fallback rendered;
    // the difference is observability only (fireOnError already fired).
  };

  // Build the renderable content for this resolution.
  let content: ReactNode = null;
  let selectionKey = "empty";

  if (selection.kind === "empty") {
    const Fallback = descriptor.fallback;
    content = Fallback ? <Fallback /> : null;
  } else if (selection.kind === "module-entry") {
    const mod = modules[selection.module];
    const entry = mod?.entryPoints?.[selection.entry];
    if (!mod || !entry) {
      const NotFound = notFoundComponent ?? DefaultNotFound;
      content = (
        <NotFound zone={zone} moduleId={selection.module} entry={selection.entry} />
      );
      selectionKey = `notfound:${selection.module}:${selection.entry}`;
    } else {
      const { Component: PanelComponent } = resolveEntryComponent(entry);
      const suspenseFallback = entry.fallback ?? loadingFallback ?? null;
      selectionKey = `entry:${selection.module}:${selection.entry}`;
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
    // Mount a JourneyOutlet for the referenced journey handle. If the
    // selector did not supply an instanceId, mint one lazily via the
    // journey runtime (which must be available via <JourneyProvider>).
    const journeyRuntime = journeyContext?.runtime;
    if (!journeyRuntime) {
      content = renderError(
        zone,
        new Error(
          "[@modular-react/compositions] Zone returned a `journey` resolution but no <JourneyProvider> is mounted above the composition.",
        ),
        errorComponent,
      );
      selectionKey = `journey-err:${selection.handle.id}`;
    } else {
      // Idempotent on (handle.id, input) — the journey runtime's persistence
      // key (if any) handles deduping; otherwise we mint each time and rely
      // on JourneyOutlet's listener-count semantics for cleanup.
      const journeyInstanceId =
        selection.instanceId ??
        journeyRuntime.start(selection.handle, selection.input as never);
      selectionKey = `journey:${selection.handle.id}:${journeyInstanceId}`;
      content = (
        <JourneyOutlet
          instanceId={journeyInstanceId}
          loadingFallback={loadingFallback}
        />
      );
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
      >
        {content}
      </ZoneErrorBoundary>
    </CompositionInstanceContext.Provider>
  );
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
  return createElement(Fallback, { zone, error });
}

function DefaultNotFound({ zone, moduleId, entry }: CompositionOutletNotFoundProps): ReactNode {
  return createElement(
    "div",
    { style: { padding: "1rem", color: "#c53030" }, role: "alert" },
    `Composition zone "${zone}": no entry "${moduleId}.${entry}" on the registered modules.`,
  );
}

function DefaultError({ zone, error }: CompositionOutletErrorProps): ReactNode {
  const message = error instanceof Error ? error.message : String(error);
  return createElement(
    "div",
    {
      style: {
        padding: "1rem",
        border: "1px solid #e53e3e",
        borderRadius: "0.5rem",
        margin: "0.25rem",
      },
      role: "alert",
      "data-composition-zone-error": zone,
    },
    createElement(
      "h4",
      { style: { color: "#e53e3e", margin: "0 0 0.5rem 0" } },
      `Zone "${zone}" encountered an error`,
    ),
    createElement(
      "pre",
      { style: { fontSize: "0.875rem", color: "#718096", whiteSpace: "pre-wrap" } },
      message,
    ),
  );
}

interface ZoneErrorBoundaryProps {
  readonly zone: string;
  readonly onError: (err: unknown) => void;
  readonly errorComponent?: ComponentType<CompositionOutletErrorProps>;
  readonly children: ReactNode;
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
      const Fallback = this.props.errorComponent ?? DefaultError;
      return createElement(Fallback, {
        zone: this.props.zone,
        error: this.state.error,
      });
    }
    return this.props.children;
  }
}
