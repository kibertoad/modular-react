import { createContext, useContext, useSyncExternalStore } from "react";
import type { Store } from "@modular-react/core";
import type {
  CompositionInstanceId,
  CompositionRuntime,
  CompositionZoneEvent,
} from "./types.js";

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
 * when the selected slice changes — under the hood
 * `useSyncExternalStore` short-circuits on `Object.is` equality so
 * siblings whose selector output is stable bail naturally.
 *
 * ```ts
 * const docId = useCompositionState((s: EditorState) => s.documentId);
 * ```
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
  // Stable `getSnapshot` identity per render path — selector callers
  // pass the selector unchanged, no-selector callers read the whole
  // state. Both branches return the exact narrow type so the overload
  // resolution at the call site stays honest.
  const getSnapshot = selector
    ? () => selector(store.getState())
    : () => store.getState() as unknown as U;
  return useSyncExternalStore(
    store.subscribe,
    getSnapshot,
    getSnapshot,
  );
}

/**
 * Imperatively mutate the composition's state. Accepts either a partial
 * object (shallow-merged via `Store.setState`) or an updater function.
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
    return selector
      ? useCompositionState<TState, U>(selector)
      : useCompositionState<TState>();
  }
  return {
    useState: useState as TypedCompositionHooks<TState>["useState"],
    useDispatch: () => useCompositionDispatch<TState>(),
    useEmit: () => useCompositionEmit(),
    useZone: () => useCompositionZone(),
  };
}
