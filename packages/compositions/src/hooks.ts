import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Store } from "@modular-react/core";
import type {
  CompositionHandleRef,
  CompositionInstanceId,
  CompositionRuntime,
  CompositionZoneEvent,
} from "./types.js";
import { useCompositionsContext } from "./provider.js";

/**
 * Per-mount context value the `<CompositionOutlet>` installs above each
 * zone's panel. Foreign panel components — components living in
 * integration modules that know nothing about the composition — read
 * the active composition state through this context, never via a global
 * hook. Multiple compositions can mount concurrently; the context binds
 * each panel to its host instance unambiguously.
 */
export interface CompositionContextValue<TState = unknown> {
  readonly runtime: CompositionRuntime;
  readonly compositionId: string;
  readonly instanceId: CompositionInstanceId;
  readonly zone: string;
  readonly store: Store<TState>;
  readonly dispatch: (
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ) => void;
  readonly emit: (event: CompositionZoneEvent) => void;
}

export const CompositionInstanceContext = createContext<CompositionContextValue | null>(null);

/**
 * Internal helper that reads the active context. The `use` prefix
 * matches React's hook naming convention so the `react-hooks` ESLint
 * rule traces through it.
 */
function useRequiredContext(): CompositionContextValue {
  const ctx = useContext(CompositionInstanceContext);
  if (!ctx) {
    throw new Error(
      "[@modular-react/compositions] useCompositionState/Dispatch/Emit/Zone must be called from inside a <CompositionOutlet> zone panel.",
    );
  }
  return ctx;
}

/**
 * Read the composition's scoped state. Pass a selector to only re-render
 * when the selected slice changes — under the hood `useSyncExternalStore`
 * short-circuits on `Object.is` equality between snapshots.
 *
 * ```ts
 * const docId = useCompositionState((s: EditorState) => s.documentId);
 * ```
 *
 * **Selectors returning derived objects.** Because React invokes
 * `getSnapshot` on every render and compares via `Object.is`, a selector
 * that returns a fresh object on each call (`(s) => ({ id: s.docId,
 * dirty: s.dirty })`) would otherwise cause infinite re-renders and a
 * React `"The result of getSnapshot should be cached"` warning. This
 * hook caches the selector result keyed on the underlying state
 * reference: the selector runs again only when the store's state object
 * identity changes, so callers can return fresh objects safely as long
 * as the underlying state mutates through `setState` (the standard path).
 *
 * Note: TypeScript can't infer `TState` when this hook is called without
 * a selector — explicit `useCompositionState<EditorState>()` is required.
 * For a fully-typed API per-composition, use {@link createCompositionContext}.
 */
export function useCompositionState<TState>(): TState;
export function useCompositionState<TState, U>(selector: (state: TState) => U): U;
export function useCompositionState<TState, U = TState>(
  selector?: (state: TState) => U,
): TState | U {
  const ctx = useRequiredContext();
  const store = ctx.store as Store<TState>;

  // Cache the latest selector result keyed on (state, selector). React
  // invokes `getSnapshot` on every render and compares with `Object.is`;
  // recomputing a fresh selector result each call would tear with the
  // React "result of getSnapshot should be cached" warning whenever the
  // selector returns a derived object. The store's `setState` always
  // replaces the state reference, so identity on `lastState` is the
  // correct staleness signal. Selector identity is also tracked so a
  // caller passing a new selector across renders gets a fresh result
  // without waiting for the next dispatch.
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const lastStateRef = useRef<TState | typeof STATE_EMPTY>(STATE_EMPTY);
  const lastSelectorRef = useRef<typeof selector | undefined>(undefined);
  const lastResultRef = useRef<TState | U | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const currentSelector = selectorRef.current;
    if (
      !Object.is(state, lastStateRef.current) ||
      !Object.is(currentSelector, lastSelectorRef.current)
    ) {
      lastStateRef.current = state;
      lastSelectorRef.current = currentSelector;
      lastResultRef.current = currentSelector ? currentSelector(state) : (state as unknown as U);
    }
    return lastResultRef.current as TState | U;
  }, [store]);

  // Wrap `store.subscribe` in a stable closure so a future Store
  // implementation that relies on `this` (e.g. a class-shape store)
  // doesn't break silently when the method reference is detached from
  // the store object.
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as TState | U;
}

// Unique sentinel for the "no state observed yet" condition. A real
// state value can never equal this symbol, so `Object.is` comparison
// against it correctly triggers a first-time selector evaluation.
const STATE_EMPTY = Symbol("composition-state-empty");

/**
 * Imperatively mutate the composition's state. Accepts either a partial
 * object (shallow-merged via `Store.setState`) or an updater function.
 *
 * **`TState` is caller-asserted.** The hook does not see the active
 * composition's declared state shape — it widens to whatever `TState`
 * the caller spells. Use {@link createCompositionContext} to get a
 * pre-typed `useDispatch` that fixes `TState` once at module scope and
 * removes the per-call burden.
 */
export function useCompositionDispatch<TState>(): (
  updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
) => void {
  return useRequiredContext().dispatch as (
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ) => void;
}

/**
 * Emit a zone event. Routed to the outlet's `onZoneEvent` prop with the
 * zone name attached. Use this for cross-zone hand-offs that can't be
 * expressed through state alone (e.g. "open the diff modal").
 */
export function useCompositionEmit(): (event: CompositionZoneEvent) => void {
  return useRequiredContext().emit;
}

/**
 * Read the composition id, instance id, and active zone name of the
 * panel currently being rendered. Useful for analytics, scoped logging,
 * and panels that branch behavior on which zone they're filling.
 */
export function useCompositionZone(): {
  readonly compositionId: string;
  readonly instanceId: CompositionInstanceId;
  readonly zone: string;
} {
  const ctx = useRequiredContext();
  return {
    compositionId: ctx.compositionId,
    instanceId: ctx.instanceId,
    zone: ctx.zone,
  };
}

/**
 * Per-composition typed hook bundle returned by
 * {@link createCompositionContext}.
 */
export interface TypedCompositionHooks<TState> {
  readonly useState: {
    (): TState;
    <U>(selector: (state: TState) => U): U;
  };
  readonly useDispatch: () => (
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ) => void;
  readonly useEmit: () => (event: CompositionZoneEvent) => void;
  readonly useZone: () => {
    readonly compositionId: string;
    readonly instanceId: CompositionInstanceId;
    readonly zone: string;
  };
}

/**
 * Build a pre-typed bundle of composition hooks for a single
 * composition's state shape. Composition authors call this once and
 * export the result so panels don't have to spell `<TState>` at every
 * call site:
 *
 * ```ts
 * // editor-composition/hooks.ts
 * export const { useState, useDispatch } = createCompositionContext<EditorState>();
 *
 * // some-panel.tsx
 * const docId = useState(s => s.documentId);
 * ```
 *
 * Zero runtime cost — each method is a thin pass-through to the
 * underlying generic hook.
 */
export function createCompositionContext<TState>(): TypedCompositionHooks<TState> {
  // Single function that the typed overloads route to. We don't branch on
  // the selector argument at the React layer — `useCompositionState`
  // already does that internally — so the hook call count is identical
  // whether or not the caller supplies a selector.
  function useState<U>(selector: (state: TState) => U): U;
  function useState(): TState;
  function useState<U>(selector?: (state: TState) => U): TState | U {
    return selector ? useCompositionState<TState, U>(selector) : useCompositionState<TState>();
  }
  return {
    useState: useState as TypedCompositionHooks<TState>["useState"],
    useDispatch: () => useCompositionDispatch<TState>(),
    useEmit: () => useCompositionEmit(),
    useZone: () => useCompositionZone(),
  };
}

// ---------------------------------------------------------------------------
// Host-side: mint an instance for a composition the host wants to render.
// ---------------------------------------------------------------------------

/**
 * Brand symbol on {@link UseCompositionOptions} so the runtime overload
 * resolver can disambiguate it from an `input` of shape `{ runtime: … }`
 * without relying on key-counting (which would break the moment options
 * gained a second field). Always set via `useCompositionOptions(...)` —
 * callers can also spread the constant export `USE_COMPOSITION_OPTIONS`.
 */
const USE_COMPOSITION_OPTIONS_BRAND: unique symbol = Symbol.for(
  "@modular-react/compositions/useCompositionOptions",
);

export interface UseCompositionOptions {
  /**
   * Runtime to mint the instance against. Optional when a
   * `<CompositionsProvider>` is mounted above — the hook reads the
   * runtime from context in that case (parallel to `<CompositionOutlet>`).
   */
  readonly runtime?: CompositionRuntime;
}

/**
 * Wrap a {@link UseCompositionOptions} object so {@link useComposition}
 * can detect it positionally even when `TInput` happens to have a
 * `runtime` field. Pass the result as the last argument:
 *
 * ```ts
 * useComposition(handle, input, useCompositionOptions({ runtime }));
 * ```
 *
 * Branding is the only safe disambiguation when `TInput` is `unknown` —
 * a key-shape sniff (the previous approach) misclassified any input
 * object whose only key was `runtime`.
 */
export function useCompositionOptions(
  options: UseCompositionOptions,
): UseCompositionOptions & { readonly [USE_COMPOSITION_OPTIONS_BRAND]: true } {
  return Object.assign({}, options, {
    [USE_COMPOSITION_OPTIONS_BRAND]: true as const,
  });
}

function isBrandedOptions(value: unknown): value is UseCompositionOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[USE_COMPOSITION_OPTIONS_BRAND] === true
  );
}

/**
 * Mint a composition instance once for the lifetime of the calling
 * component, returning its id. Use the returned id to drive
 * `<CompositionOutlet instanceId={id}>` in the same render path.
 *
 * Disposal is handled automatically by the outlet's attach/detach
 * refcount: when the outlet unmounts and no other listeners remain, the
 * runtime disposes the instance after a microtask (which also keeps
 * StrictMode's simulated mount/unmount/mount dance from tearing the
 * instance down on first visit). Hosts that need imperative teardown
 * earlier (a Cmd-K palette closing a stale instance, an "abort" button)
 * should call `runtime.end(id)` directly.
 *
 * **The bound instance is fixed at first render.** The hook does not
 * react to subsequent changes to `handle`, `input`, or `options.runtime`
 * — it returns the originally-minted id for the lifetime of the calling
 * component. To re-mint with different arguments, change the
 * component's `key` so React unmounts and remounts the hook. This
 * matches the React-docs "Lazy initial state" guidance: re-running
 * `start()` on every render would orphan the previous instance.
 *
 * Implementation note: the hook stores the id in a `useRef` and
 * lazy-initializes on first render via `runtime.start()` — there is no
 * `useEffect` and no setState round-trip. The "do it once on mount"
 * pattern with `useEffect` is the React-docs anti-pattern this hook
 * replaces (see "You Might Not Need an Effect").
 */
export function useComposition<TId extends string, TInput>(
  handle: CompositionHandleRef<TId, TInput>,
  ...rest: [TInput] extends [void]
    ? [options?: UseCompositionOptions]
    : [input: TInput, options?: UseCompositionOptions]
): CompositionInstanceId;
export function useComposition(
  compositionId: string,
  input: unknown,
  options?: UseCompositionOptions,
): CompositionInstanceId;
export function useComposition(
  handleOrId: CompositionHandleRef<string, unknown> | string,
  ...rest: unknown[]
): CompositionInstanceId {
  // Disambiguate the overloads positionally with a symbol brand on
  // `options`. The previous "object with only a `runtime` key" sniff
  // misclassified an `input` of shape `{ runtime: … }` (a perfectly
  // valid TInput) as options, and would break the moment options
  // gained a second field. The brand is the only signal we trust.
  let input: unknown = undefined;
  let options: UseCompositionOptions | undefined;
  if (rest.length > 0) {
    const last = rest[rest.length - 1];
    if (isBrandedOptions(last)) {
      options = last;
      if (rest.length > 1) input = rest[0];
    } else {
      input = last;
    }
  }

  const context = useCompositionsContext();
  const runtime = options?.runtime ?? context?.runtime;
  if (!runtime) {
    throw new Error(
      "[@modular-react/compositions] useComposition() needs a runtime. Pass `options.runtime` (via `useCompositionOptions(...)`) or mount a <CompositionsProvider>.",
    );
  }

  // Lazy ref init: the start() call runs exactly once per committed
  // component instance.
  //
  // Why useRef and not useState(() => start()): React's StrictMode
  // intentionally double-invokes `useState` lazy initializers in dev
  // to test purity. `runtime.start()` is impure (it mutates the
  // runtime's instance map), so the lazy-init form would leak one
  // orphan instance per mount under StrictMode. A useRef + render-
  // time idempotent write does NOT trip that path: the ref object
  // persists across StrictMode's double-render of the same fiber,
  // so the `=== null` check on the second pass short-circuits.
  //
  // Concurrent rendering bail-outs are also safe: a discarded render's
  // ref write persists onto the fiber, and the next render attempt
  // sees `ref.current !== null` and skips `start()`. The only path
  // that calls start() twice is a real unmount/remount cycle (route
  // change, key change), where the outlet's detach microtask has
  // already disposed the previous instance by the time the next mount
  // runs.
  const ref = useRef<CompositionInstanceId | null>(null);
  if (ref.current === null) {
    ref.current = runtime.start(handleOrId as never, input as never);
  }
  const instanceId = ref.current;

  // Keep the instance alive for the lifetime of the calling component.
  //
  // The outlet's `__attach`/`__detach` refcount is the usual disposal
  // signal, but a caller that holds an id WITHOUT mounting an outlet
  // (or that conditionally renders one) would otherwise orphan the
  // instance forever: `runtime.start()` puts the record in the
  // instances map but never schedules disposal — only `__detach` and
  // `subscribe`'s unsubscribe path do.
  //
  // The fix is to register a no-op subscription. `runtime.subscribe`
  // increments `listeners`; the returned unsubscribe runs the same
  // microtask-deferred disposal gate as `__detach`, so when the last
  // outlet and the last subscriber both go away the instance is
  // cleaned up — and a still-mounted sibling outlet keeps the
  // instance alive (the gate checks `outletRefCount === 0 &&
  // listeners.size === 0`).
  //
  // StrictMode dev: mount → simulated unmount → remount fires effect
  // cleanup once, then a fresh effect. The cleanup's unsubscribe
  // microtask sees `listeners.size === 0` (until the remount's effect
  // re-subscribes) AND `outletRefCount === 0` if no outlet attached
  // yet — but the remount's start() in the fresh fiber has already
  // ALSO registered a listener on the new id, not this one. So the
  // first fiber's instance correctly disposes. Real instance: one
  // per visible component, matching the documented contract.
  useEffect(() => {
    // No-op listener — the goal is only to participate in the
    // disposal refcount. We don't need to react to state changes.
    const unsubscribe = runtime.subscribe(instanceId, () => {});
    return unsubscribe;
  }, [runtime, instanceId]);

  return instanceId;
}
