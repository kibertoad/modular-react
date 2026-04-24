import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import { ModuleExitProvider, type ModuleExitEvent } from "@modular-react/react";

import type { JourneyRuntime } from "./types.js";

/**
 * Shell-level context read by `<JourneyOutlet>` so callers don't have to
 * thread `runtime` through every container that hosts a journey.
 *
 * `onModuleExit` is still surfaced here for backward compatibility with
 * consumers that introspect the provider value. The actual dispatch now
 * flows through `<ModuleExitProvider>` from `@modular-react/react`, which
 * `<JourneyProvider>` mounts automatically. Prefer consuming
 * `useModuleExit` / `useModuleExitDispatcher` from the react package
 * directly in new code.
 */
export interface JourneyProviderValue {
  /** Journey runtime — usually `manifest.journeys`. */
  readonly runtime: JourneyRuntime;
  /**
   * Optional fallback invoked by `<ModuleTab>` / `<ModuleRoute>` after any
   * local `onExit` prop has run. Wiring this at the provider level gives a
   * shell global telemetry / tab-close forwarding without threading the
   * callback through every host.
   */
  readonly onModuleExit?: (event: ModuleExitEvent) => void;
}

const JourneyContext = createContext<JourneyProviderValue | null>(null);

export interface JourneyProviderProps {
  readonly runtime: JourneyRuntime;
  readonly onModuleExit?: JourneyProviderValue["onModuleExit"];
  readonly children: ReactNode;
}

/**
 * Provides the journey runtime to descendant `<JourneyOutlet>` nodes, and
 * composes over `<ModuleExitProvider>` so module hosts (`<ModuleTab>`,
 * `<ModuleRoute>`, anything using `useModuleExit`) see the shell's
 * `onModuleExit` dispatcher without needing a second provider.
 *
 * Existing journey consumers do not need to change — `onModuleExit` keeps
 * firing for every module exit emitted outside a journey step.
 */
export function JourneyProvider(props: JourneyProviderProps): ReactNode {
  const { runtime, onModuleExit, children } = props;
  const value: JourneyProviderValue = { runtime, onModuleExit };
  return createElement(
    JourneyContext.Provider,
    { value },
    createElement(ModuleExitProvider, { onExit: onModuleExit, children }),
  );
}

/** Read the current provider value, or `null` when none is mounted. */
export function useJourneyContext(): JourneyProviderValue | null {
  return useContext(JourneyContext);
}
