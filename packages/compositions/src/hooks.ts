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

function getRequiredContext(): CompositionContextValue {
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
 */
export function useCompositionState<TState>(): TState;
export function useCompositionState<TState, U>(selector: (state: TState) => U): U;
export function useCompositionState<TState, U>(selector?: (state: TState) => U): TState | U {
  const ctx = getRequiredContext();
  const store = ctx.store as Store<TState>;
  const getSnapshot = selector
    ? () => selector(store.getState())
    : (() => store.getState() as unknown as TState | U);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot) as TState | U;
}

/**
 * Imperatively mutate the composition's state. Accepts either a partial
 * object (shallow-merged via `Store.setState`) or an updater function.
 */
export function useCompositionDispatch<TState>(): (
  updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
) => void {
  return getRequiredContext().dispatch as (
    updater: Partial<TState> | ((prev: TState) => Partial<TState> | TState),
  ) => void;
}

/**
 * Emit a zone event. Routed to the outlet's `onZoneEvent` prop with the
 * zone name attached. Use this for cross-zone hand-offs that can't be
 * expressed through state alone (e.g. "open the diff modal").
 */
export function useCompositionEmit(): (event: CompositionZoneEvent) => void {
  return getRequiredContext().emit;
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
  const ctx = getRequiredContext();
  return {
    compositionId: ctx.compositionId,
    instanceId: ctx.instanceId,
    zone: ctx.zone,
  };
}
