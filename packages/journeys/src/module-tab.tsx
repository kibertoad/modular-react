import { createElement, useMemo } from "react";
import type { ReactNode } from "react";
import type { ModuleDescriptor, ModuleEntryProps } from "@modular-react/core";
import { ModuleErrorBoundary } from "@modular-react/react";

export interface ModuleTabExitEvent {
  readonly moduleId: string;
  readonly entry: string;
  readonly exit: string;
  readonly output: unknown;
  readonly tabId?: string;
}

export interface ModuleTabProps<TInput = unknown> {
  /** Full module descriptor — the shell looks this up by id. */
  readonly module: ModuleDescriptor<any, any, any, any>;
  /**
   * Entry point name on the module. Falls back to the module's legacy
   * `component` field when omitted and no entry by that name exists.
   */
  readonly entry?: string;
  readonly input?: TInput;
  /** Opaque tab id threaded through to `onExit` for the shell to close it. */
  readonly tabId?: string;
  /**
   * Called when the module emits an exit. Shell typically closes the tab
   * inside this callback and optionally forwards to a global `onModuleExit`.
   */
  readonly onExit?: (event: ModuleTabExitEvent) => void;
}

/**
 * Host for a single module instance rendered outside any route — in a tab,
 * modal, or panel. Default exit behavior delegates to the `onExit` callback
 * provided by the shell; the module itself stays journey-unaware.
 */
export function ModuleTab<TInput = unknown>(props: ModuleTabProps<TInput>): ReactNode {
  const { module: mod, entry, input, tabId, onExit } = props;

  const entryName = entry ?? "default";
  const entryPoint = mod.entryPoints?.[entryName];

  const exit = useMemo(
    () => (exitName: string, output?: unknown) => {
      onExit?.({
        moduleId: mod.id,
        entry: entryName,
        exit: exitName,
        output,
        tabId,
      });
    },
    [mod.id, entryName, tabId, onExit],
  );

  let content: ReactNode;
  if (entryPoint) {
    const Component = entryPoint.component as React.ComponentType<ModuleEntryProps<TInput, any>>;
    content = createElement(Component, { input: input as TInput, exit });
  } else if (mod.component) {
    // Back-compat: render the legacy workspace component when no entry
    // matches the requested name. Entry contracts are opt-in.
    const Component = mod.component as React.ComponentType<any>;
    content = createElement(Component, { input, tabId });
  } else {
    content = createElement(
      "div",
      { style: { padding: "1rem", color: "#c53030" } },
      `Module "${mod.id}" has no entry "${entryName}" and no component.`,
    );
  }

  return createElement(ModuleErrorBoundary, { moduleId: mod.id, children: content });
}
