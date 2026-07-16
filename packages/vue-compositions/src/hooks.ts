import { inject, onScopeDispose, shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { Store } from "@modular-frontend/core";
import type {
  CompositionInstanceId,
  CompositionRuntime,
  CompositionZoneEvent,
} from "@modular-frontend/compositions-engine";

/**
 * Per-mount context value the `<CompositionOutlet>` (PR-34) installs above each
 * zone's panel. Foreign panel components — components living in integration
 * modules that know nothing about the composition — read the active
 * composition state through this context, never via a global hook. Multiple
 * compositions can mount concurrently; the context binds each panel to its host
 * instance unambiguously. The Vue analog of the React `CompositionContextValue`.
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

/**
 * Injection key holding the active {@link CompositionContextValue}, or `null`
 * when a panel composable is used outside a `<CompositionOutlet>` zone. The
 * outlet (PR-34) provides this per zone panel; exported so tests and advanced
 * hosts can provide it directly. The Vue analog of the React
 * `CompositionInstanceContext`.
 */
export const compositionInstanceKey: InjectionKey<CompositionContextValue> = Symbol(
  "modular-vue.composition-instance",
);

/**
 * Internal helper that reads the active per-mount context. Throws with a
 * pointed message when called outside a zone panel, matching the React
 * `useRequiredContext` guard.
 */
function useRequiredContext(): CompositionContextValue {
  const ctx = inject(compositionInstanceKey, null);
  if (!ctx) {
    throw new Error(
      "[@modular-vue/compositions] useCompositionState/Dispatch/Emit/Zone must be called from inside a <CompositionOutlet> zone panel.",
    );
  }
  return ctx;
}

/**
 * Bridge the per-mount composition `Store<TState>` into Vue reactivity: seed a
 * `shallowRef` with the current (optionally selected) snapshot, push a fresh
 * read on every store change, and tear the subscription down on scope dispose
 * (panel unmount). The Vue analog of the React hook's `useSyncExternalStore`
 * wiring.
 *
 * The React binding caches the selector result keyed on the state reference so
 * a fresh-object-returning selector doesn't trip React's "getSnapshot should be
 * cached" warning (React invokes `getSnapshot` on every render). Vue's `setup`
 * runs once and the store push is event-driven, not render-driven, so that
 * caching is not needed here: `shallowRef`'s `Object.is` dedupe already
 * short-circuits an unchanged primitive selection, and a fresh-object selection
 * simply re-publishes when the underlying state actually changes.
 */
function subscribeStore<T, U>(store: Store<T>, selector?: (state: T) => U): ShallowRef<T | U> {
  const read = (): T | U => {
    const state = store.getState();
    return selector ? selector(state) : (state as unknown as U);
  };
  const state = shallowRef<T | U>(read());
  const unsubscribe = store.subscribe(() => {
    state.value = read();
  });
  onScopeDispose(unsubscribe);
  return state;
}

/**
 * Read the composition's scoped state as a reactive `ShallowRef`. Pass a
 * selector to only re-publish when the selected slice changes — under the hood
 * the `shallowRef` bridge short-circuits on `Object.is` equality between
 * snapshots (selector equality for free), the reactive-source convention
 * established in PR-10 (`useStore`) and PR-23 (`useZones`).
 *
 * ```ts
 * const docId = useCompositionState<EditorState, string>((s) => s.documentId);
 * // docId is a ShallowRef<string>; read docId.value in templates / watch.
 * ```
 *
 * The React analog returns the selected value directly (React re-renders on
 * store change); the Vue port returns a `ShallowRef` so it stays reactive in
 * templates and `watch`. Read `.value` at the call site.
 *
 * Note: TypeScript can't infer `TState` when this composable is called without
 * a selector — explicit `useCompositionState<EditorState>()` is required. For a
 * fully-typed API per-composition, use {@link createCompositionContext}.
 */
export function useCompositionState<TState>(): ShallowRef<TState>;
export function useCompositionState<TState, U>(selector: (state: TState) => U): ShallowRef<U>;
export function useCompositionState<TState, U = TState>(
  selector?: (state: TState) => U,
): ShallowRef<TState | U> {
  const ctx = useRequiredContext();
  const store = ctx.store as Store<TState>;
  return subscribeStore(store, selector);
}

/**
 * Imperatively mutate the composition's state. Accepts either a partial object
 * (shallow-merged via `Store.setState`) or an updater function. Returns the
 * dispatch function directly (identity-stable for the panel mount, like the
 * modules / navigation contexts) — not a ref.
 *
 * **`TState` is caller-asserted.** The composable does not see the active
 * composition's declared state shape — it widens to whatever `TState` the
 * caller spells. Use {@link createCompositionContext} to get a pre-typed
 * `useDispatch` that fixes `TState` once at module scope.
 */
export function useCompositionDispatch<TState>(): (
  updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
) => void {
  return useRequiredContext().dispatch as (
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ) => void;
}

/**
 * Emit a zone event. Routed to the outlet's `onZoneEvent` prop with the zone
 * name attached. Use this for cross-zone hand-offs that can't be expressed
 * through state alone (e.g. "open the diff modal").
 */
export function useCompositionEmit(): (event: CompositionZoneEvent) => void {
  return useRequiredContext().emit;
}

/**
 * Read the composition id, instance id, and active zone name of the panel
 * currently being rendered. Useful for analytics, scoped logging, and panels
 * that branch behavior on which zone they're filling. Returns a plain object —
 * the fields are fixed for the panel mount (the outlet keys each panel by
 * zone).
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
 * Per-composition typed composable bundle returned by
 * {@link createCompositionContext}.
 */
export interface TypedCompositionHooks<TState> {
  readonly useState: {
    (): ShallowRef<TState>;
    <U>(selector: (state: TState) => U): ShallowRef<U>;
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
 * Build a pre-typed bundle of composition composables for a single
 * composition's state shape. Composition authors call this once and export the
 * result so panels don't have to spell `<TState>` at every call site:
 *
 * ```ts
 * // editor-composition/hooks.ts
 * export const { useState, useDispatch } = createCompositionContext<EditorState>();
 *
 * // some-panel.vue <script setup>
 * const docId = useState((s) => s.documentId); // ShallowRef<string>
 * ```
 *
 * Zero runtime cost — each method is a thin pass-through to the underlying
 * generic composable.
 */
export function createCompositionContext<TState>(): TypedCompositionHooks<TState> {
  function useState<U>(selector: (state: TState) => U): ShallowRef<U>;
  function useState(): ShallowRef<TState>;
  function useState<U>(selector?: (state: TState) => U): ShallowRef<TState | U> {
    return selector ? useCompositionState<TState, U>(selector) : useCompositionState<TState>();
  }
  return {
    useState: useState as TypedCompositionHooks<TState>["useState"],
    useDispatch: () => useCompositionDispatch<TState>(),
    useEmit: () => useCompositionEmit(),
    useZone: () => useCompositionZone(),
  };
}
