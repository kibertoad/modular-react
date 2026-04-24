import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import type { ExitPointMap, ModuleDescriptor, ModuleEntryProps } from "@modular-react/core";
import { ModuleErrorBoundary, useModuleExit, type ModuleExitEvent } from "@modular-react/react";

/**
 * Exit event fired by a module rendered inside a `<ModuleTab>`.
 *
 * Alias for {@link ModuleExitEvent} from `@modular-react/react` — kept as a
 * named export for the workspace-tab entry point so existing imports keep
 * compiling. Both types have the same shape.
 */
export type ModuleTabExitEvent = ModuleExitEvent;

export interface ModuleTabProps<TInput = unknown> {
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
  /** Opaque tab id threaded through to `onExit` for the shell to close it. */
  readonly tabId?: string;
  /**
   * Called when the module emits an exit. Runs *before* the provider's
   * global `onExit` dispatcher (via `<ModuleExitProvider>`, typically
   * composed under `<JourneyProvider>`), so the shell can close the tab
   * first and let the provider hook forward to analytics / routing.
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
    // `entry` requested but module exposes no entry points at all — surface
    // the misconfiguration instead of silently falling through to the legacy
    // `component` path.
    resolvedName = undefined;
    missingEntryNotice = `Module "${mod.id}" has no entry points; \`entry="${entry}"\` cannot be resolved.`;
  }

  const entryPoint = resolvedName ? entryPoints?.[resolvedName] : undefined;

  // Hook order must stay stable across renders — always call useModuleExit,
  // even if resolvedName is missing. When missing, the returned `exit` is
  // never invoked because we render the error notice instead.
  const exit = useModuleExit(mod.id, resolvedName ?? "", {
    tabId,
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
    // The entry's declared input schema is the source of truth for whether
    // `input` is required. At runtime we don't reflect on the schema, but
    // we can still refuse to render with a visibly wrong `undefined` when
    // the caller forgot to pass it — that surfaces the misconfiguration
    // instead of letting the component throw deep inside its render with
    // `Cannot read properties of undefined`. Callers whose entry schema
    // is `void` should pass `input={undefined}` explicitly.
    if (input === undefined && !("input" in props)) {
      content = createElement(
        "div",
        { style: { padding: "1rem", color: "#c53030" } },
        `Module "${mod.id}" entry "${resolvedName ?? ""}" was rendered without an \`input\` prop. ` +
          `Pass \`input={undefined}\` explicitly if the entry accepts no input.`,
      );
    } else {
      const Component = entryPoint.component as ComponentType<
        ModuleEntryProps<TInput, ExitPointMap>
      >;
      content = createElement(Component, { input: input as TInput, exit });
    }
  } else if (mod.component) {
    // Back-compat: render the legacy workspace component when the module
    // exposes no entry points. Entry contracts are opt-in.
    const Component = mod.component as ComponentType<{
      input?: unknown;
      tabId?: string;
    }>;
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
