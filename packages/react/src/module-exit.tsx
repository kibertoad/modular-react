import { createContext, createElement, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { ExitFn, ExitPointMap } from "@modular-react/core";

/**
 * Event fired when a module entry emits an exit outside a journey context.
 *
 * Exactly one of `tabId` / `routeId` is expected to be set — `tabId` when
 * the host is a workspace `<ModuleTab>`, `routeId` when the host is a
 * `<ModuleRoute>`. Both are omitted for ad-hoc `useModuleExit` callers
 * (modals, panels) that aren't scoped to a tab or a route.
 */
export interface ModuleExitEvent {
  readonly moduleId: string;
  readonly entry: string;
  readonly exit: string;
  readonly output: unknown;
  readonly tabId?: string;
  readonly routeId?: string;
}

/**
 * Shell-level dispatcher called whenever a module entry emits an exit while
 * hosted outside a journey (via `<ModuleTab>`, `<ModuleRoute>`, or any host
 * that uses {@link useModuleExit}).
 *
 * This is the "step 0" plumbing: a module entry can fire an exit from a
 * standalone context, and the composition root decides what it means —
 * typically starting a journey, opening a tab, or routing somewhere.
 */
export type ModuleExitHandler = (event: ModuleExitEvent) => void;

interface ModuleExitContextValue {
  readonly onExit?: ModuleExitHandler;
}

const ModuleExitContext = createContext<ModuleExitContextValue | null>(null);

export interface ModuleExitProviderProps {
  /**
   * Global dispatcher invoked whenever a descendant module entry emits an
   * exit. Keep this handler at the composition root so wiring is visible
   * in one place.
   */
  readonly onExit?: ModuleExitHandler;
  readonly children: ReactNode;
}

/**
 * Provides a shell-level `onExit` dispatcher to descendant module hosts.
 *
 * Independent of the journeys plugin: a shell using only modules can mount
 * this provider and wire `onExit` to app-level intents (open modal, switch
 * workspace, start a journey). When `<JourneyProvider>` is present it
 * composes over this provider automatically — you do not need both.
 */
export function ModuleExitProvider(props: ModuleExitProviderProps): ReactNode {
  const { onExit, children } = props;
  const value = useMemo<ModuleExitContextValue>(() => ({ onExit }), [onExit]);
  return createElement(ModuleExitContext.Provider, { value }, children);
}

/** Read the current module-exit dispatcher, or `null` when none is mounted. */
export function useModuleExitDispatcher(): ModuleExitHandler | undefined {
  return useContext(ModuleExitContext)?.onExit;
}

/**
 * Build an `exit` callback bound to a specific `(moduleId, entry)` that
 * forwards every call to the nearest {@link ModuleExitProvider}'s handler.
 *
 * Typed the same way `<JourneyOutlet>` types its `exit` prop — the returned
 * function is a fully typed `ExitFn<TExits>` for the module's exit map.
 * Pass `tabId` when the host represents a workspace tab, or `routeId`
 * when the host is a route. At most one of the two should be supplied;
 * the event shape allows both to be absent for ad-hoc callers.
 */
export function useModuleExit<TExits extends ExitPointMap = ExitPointMap>(
  moduleId: string,
  entry: string,
  options: {
    readonly tabId?: string;
    readonly routeId?: string;
    readonly localOnExit?: ModuleExitHandler;
  } = {},
): ExitFn<TExits> {
  const { tabId, routeId, localOnExit } = options;
  const globalOnExit = useModuleExitDispatcher();
  return useMemo<ExitFn<TExits>>(
    () =>
      ((exitName: string, output?: unknown) => {
        const event: ModuleExitEvent = {
          moduleId,
          entry,
          exit: exitName,
          output,
          tabId,
          routeId,
        };
        localOnExit?.(event);
        globalOnExit?.(event);
      }) as ExitFn<TExits>,
    [moduleId, entry, tabId, routeId, localOnExit, globalOnExit],
  );
}
