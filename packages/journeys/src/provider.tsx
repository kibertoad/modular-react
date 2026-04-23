import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";

import type { JourneyRuntime } from "./types.js";

/**
 * Shell-level context read by `<JourneyOutlet>` and `<ModuleTab>` so callers
 * don't have to thread `runtime`, `modules`, or `onModuleExit` through every
 * container that hosts a journey or a module tab.
 */
export interface JourneyProviderValue {
  /** Journey runtime — usually `manifest.journeys`. */
  readonly runtime: JourneyRuntime;
  /**
   * Optional fallback invoked by `<ModuleTab>` after any of its own `onExit`
   * (prop) has run. Wire this to the host's `onModuleExit` to get global
   * telemetry / tab-close forwarding without passing it down to every tab.
   */
  readonly onModuleExit?: (event: {
    readonly moduleId: string;
    readonly entry: string;
    readonly exit: string;
    readonly output: unknown;
    readonly tabId?: string;
  }) => void;
}

const JourneyContext = createContext<JourneyProviderValue | null>(null);

export interface JourneyProviderProps {
  readonly runtime: JourneyRuntime;
  readonly onModuleExit?: JourneyProviderValue["onModuleExit"];
  readonly children: ReactNode;
}

/**
 * Provides the journey runtime (and optional `onModuleExit`) to descendant
 * `<JourneyOutlet>` and `<ModuleTab>` nodes. Explicit props on those
 * components still win; the provider supplies the default.
 */
export function JourneyProvider(props: JourneyProviderProps): ReactNode {
  const { runtime, onModuleExit, children } = props;
  const value: JourneyProviderValue = { runtime, onModuleExit };
  return createElement(JourneyContext.Provider, { value }, children);
}

/** Read the current provider value, or `null` when none is mounted. */
export function useJourneyContext(): JourneyProviderValue | null {
  return useContext(JourneyContext);
}
