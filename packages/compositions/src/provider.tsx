import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";

import type { CompositionRuntime } from "./types.js";

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
  const value: CompositionProviderValue = { runtime };
  return createElement(CompositionsContext.Provider, { value }, children);
}

/** Read the current provider value, or `null` when none is mounted. */
export function useCompositionsContext(): CompositionProviderValue | null {
  return useContext(CompositionsContext);
}
