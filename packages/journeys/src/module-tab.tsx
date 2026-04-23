import { createElement, useMemo } from "react";
import type { ReactNode } from "react";
import type { ModuleDescriptor, ModuleEntryProps } from "@modular-react/core";
import { ModuleErrorBoundary } from "@modular-react/react";

import { useJourneyContext } from "./provider.js";

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
   * Entry point name on the module. If omitted and the module exposes
   * exactly one entry, that entry is used automatically. If the module
   * exposes several entries, the name must be supplied — passing an
   * unknown name renders an error notice. A module with no entry points
   * falls back to the legacy `component` field.
   */
  readonly entry?: string;
  readonly input?: TInput;
  /** Opaque tab id threaded through to `onExit` for the shell to close it. */
  readonly tabId?: string;
  /**
   * Called when the module emits an exit. Runs *before* the provider's
   * global `onModuleExit` (when a `<JourneyProvider>` is mounted above), so
   * the shell can close the tab first and let the provider hook forward to
   * analytics / routing.
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
  const context = useJourneyContext();
  const globalOnExit = context?.onModuleExit;

  const entryPoints = mod.entryPoints;
  const entryNames = entryPoints ? Object.keys(entryPoints) : [];
  let resolvedName: string | undefined = entry;
  let missingEntryNotice: string | null = null;
  if (entry === undefined) {
    if (entryNames.length === 1) {
      resolvedName = entryNames[0];
    } else if (entryNames.length > 1) {
      missingEntryNotice = `Module "${mod.id}" exposes multiple entries (${entryNames.join(", ")}); pass the \`entry\` prop to disambiguate.`;
    }
  } else if (entryPoints && !(entry in entryPoints)) {
    missingEntryNotice = `Module "${mod.id}" has no entry "${entry}". Registered: ${entryNames.join(", ") || "(none)"}.`;
  }

  const entryPoint = resolvedName ? entryPoints?.[resolvedName] : undefined;

  const exit = useMemo(
    () => (exitName: string, output?: unknown) => {
      if (!resolvedName) return;
      const event: ModuleTabExitEvent = {
        moduleId: mod.id,
        entry: resolvedName,
        exit: exitName,
        output,
        tabId,
      };
      onExit?.(event);
      // Forward to the provider-level handler so a shell that registers
      // onModuleExit once at the root gets every module exit without
      // threading the callback through every tab.
      globalOnExit?.(event);
    },
    [mod.id, resolvedName, tabId, onExit, globalOnExit],
  );

  let content: ReactNode;
  if (missingEntryNotice) {
    content = createElement(
      "div",
      { style: { padding: "1rem", color: "#c53030" } },
      missingEntryNotice,
    );
  } else if (entryPoint) {
    const Component = entryPoint.component as React.ComponentType<ModuleEntryProps<TInput, any>>;
    content = createElement(Component, { input: input as TInput, exit });
  } else if (mod.component) {
    // Back-compat: render the legacy workspace component when the module
    // exposes no entry points. Entry contracts are opt-in.
    const Component = mod.component as React.ComponentType<any>;
    content = createElement(Component, { input, tabId });
  } else {
    content = createElement(
      "div",
      { style: { padding: "1rem", color: "#c53030" } },
      `Module "${mod.id}" has no entry points and no component.`,
    );
  }

  return createElement(ModuleErrorBoundary, { moduleId: mod.id, children: content });
}
