import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type { CompositionRuntime } from "@modular-frontend/compositions-engine";

/**
 * Shell-level context read by `<CompositionOutlet>` so callers don't have
 * to thread `runtime` through every container that mounts a composition.
 *
 * Parallel to `JourneyProviderValue`. Unlike the journey provider, the
 * composition provider intentionally does not own a `ModuleExitProvider`
 * — composition panels emit via `useCompositionEmit`, not via the global
 * module-exit dispatcher.
 */
export interface CompositionProviderValue {
  readonly runtime: CompositionRuntime;
}

const CompositionsContext = createContext<CompositionProviderValue | null>(null);

export interface CompositionsProviderProps {
  readonly runtime: CompositionRuntime;
  readonly children: ReactNode;
}

/**
 * Provides the composition runtime to descendant `<CompositionOutlet>`
 * nodes. Wired automatically by the `compositionsPlugin()` factory so
 * shells that opt in via `registry.use(compositionsPlugin())` get this
 * for free; standalone consumers can mount it directly.
 */
export function CompositionsProvider(props: CompositionsProviderProps): ReactNode {
  const { runtime, children } = props;
  // Memoize on `runtime` so descendant `useCompositionsContext()` consumers
  // don't re-render whenever the provider's parent re-renders. A fresh
  // object on every render would force React to broadcast the context
  // change even though `runtime` itself never changed.
  const value = useMemo<CompositionProviderValue>(() => ({ runtime }), [runtime]);
  return <CompositionsContext.Provider value={value}>{children}</CompositionsContext.Provider>;
}

/** Read the current provider value, or `null` when none is mounted. */
export function useCompositionsContext(): CompositionProviderValue | null {
  return useContext(CompositionsContext);
}
