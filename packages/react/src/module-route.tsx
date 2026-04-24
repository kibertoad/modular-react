import { createElement } from "react";
import type { ReactNode } from "react";
import type { ModuleDescriptor, ModuleEntryProps } from "@modular-react/core";

import { ModuleErrorBoundary } from "./error-boundary.js";
import { useModuleExit } from "./module-exit.js";
import type { ModuleExitEvent } from "./module-exit.js";

/**
 * Exit event fired by a module rendered inside a `<ModuleRoute>`.
 *
 * Alias for {@link ModuleExitEvent} from this package — kept as a named
 * export so router-mode hosts have a symmetric import surface with the
 * workspace-tab `<ModuleTab>`.
 */
export type ModuleRouteExitEvent = ModuleExitEvent;

export interface ModuleRouteProps<TInput = unknown> {
  /** Full module descriptor — the shell looks this up by id. */
  readonly module: ModuleDescriptor<any, any, any, any>;
  /**
   * Entry point name on the module. If omitted and the module exposes
   * exactly one entry, that entry is used automatically. If the module
   * exposes several entries, the name must be supplied — passing an
   * unknown name renders an error notice. If `entry` is omitted and the
   * module has no entry points, the component falls back to the legacy
   * `component` field; passing `entry` to such a module instead renders
   * the error notice so misconfiguration is surfaced.
   */
  readonly entry?: string;
  readonly input?: TInput;
  /**
   * Opaque route id threaded through to `onExit` so a shell can tell two
   * routes apart when they happen to render the same `(moduleId, entry)`.
   * The router itself owns the URL — this id is only the handle the
   * composition root uses when dispatching on the exit.
   */
  readonly routeId?: string;
  /**
   * Optional handler for history-style back navigation. Unset by default
   * because routes delegate history to the router; pass one when the
   * entry's component needs to call `goBack` (e.g. mapping to
   * `navigate(-1)` in React Router or equivalent elsewhere).
   */
  readonly goBack?: () => void;
  /**
   * Called when the module emits an exit. Runs *before* the provider's
   * global `onExit` dispatcher (via `<ModuleExitProvider>`, typically
   * composed under `<JourneyProvider>`), so the shell can navigate the
   * router first and let the provider hook forward to analytics / starting
   * a journey / opening a tab.
   */
  readonly onExit?: (event: ModuleRouteExitEvent) => void;
}

/**
 * Host for a single module instance rendered as a route element. Mirrors
 * `<ModuleTab>` semantics — the module stays journey-unaware and emits
 * exits that the composition root's {@link ModuleExitProvider} translates
 * into app-level intents (start a journey, navigate, open a modal). No
 * tab chrome, no `tabId`; the router owns the URL and history.
 */
export function ModuleRoute<TInput = unknown>(props: ModuleRouteProps<TInput>): ReactNode {
  const { module: mod, entry, input, routeId, goBack, onExit } = props;

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
  } else if (!entryPoints) {
    resolvedName = undefined;
    missingEntryNotice = `Module "${mod.id}" has no entry points; \`entry="${entry}"\` cannot be resolved.`;
  }

  const entryPoint = resolvedName ? entryPoints?.[resolvedName] : undefined;

  // Hook order must stay stable across renders — always call useModuleExit,
  // even if resolvedName is missing. When missing, the returned `exit` is
  // never invoked because we render the error notice instead.
  const exit = useModuleExit(mod.id, resolvedName ?? "", {
    routeId,
    localOnExit: onExit,
  });

  let content: ReactNode;
  if (missingEntryNotice) {
    content = createElement(
      "div",
      { style: { padding: "1rem", color: "#c53030" } },
      missingEntryNotice,
    );
  } else if (entryPoint) {
    const Component = entryPoint.component as React.ComponentType<ModuleEntryProps<TInput, any>>;
    content = createElement(Component, {
      input: input as TInput,
      exit,
      ...(goBack ? { goBack } : {}),
    });
  } else if (mod.component) {
    const Component = mod.component as React.ComponentType<any>;
    content = createElement(Component, { input, routeId });
  } else {
    content = createElement(
      "div",
      { style: { padding: "1rem", color: "#c53030" } },
      `Module "${mod.id}" has no entry points and no component.`,
    );
  }

  return createElement(ModuleErrorBoundary, { moduleId: mod.id, children: content });
}
