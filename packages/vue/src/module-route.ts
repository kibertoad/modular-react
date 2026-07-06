import { defineComponent, h, type PropType, type VNode } from "vue";
import type {
  EagerModuleEntryPoint,
  ModuleDescriptor,
  ModuleEntryProps,
} from "@modular-frontend/core";

import { ModuleErrorBoundary } from "./error-boundary.js";
import { useModuleExit, type ModuleExitEvent } from "./module-exit.js";

/**
 * Exit event fired by a module rendered inside a `<ModuleRoute>`.
 *
 * Alias for {@link ModuleExitEvent} from this package — kept as a named export
 * so router-mode hosts have a symmetric import surface with workspace tabs.
 */
export type ModuleRouteExitEvent = ModuleExitEvent;

const noticeStyle = { padding: "1rem", color: "#c53030" } as const;

/**
 * Host for a single module instance rendered as a route element. Vue analog of
 * the React `<ModuleRoute>`: the module stays journey-unaware and emits exits
 * that the composition root's {@link ModuleExitProvider} translates into
 * app-level intents (start a journey, navigate, open a modal). No tab chrome,
 * no `tabId`; the router owns the URL and history.
 *
 * Entry resolution happens once at setup (the mounted `(module, entry)` pair is
 * stable per route); the render function only re-runs for `input` / `goBack`
 * changes. Authored with `defineComponent` + a render function per decision D4.
 */
export const ModuleRoute = defineComponent({
  name: "ModuleRoute",
  props: {
    /** Full module descriptor — the shell looks this up by id. */
    module: {
      type: Object as PropType<ModuleDescriptor<any, any, any, any>>,
      required: true,
    },
    /**
     * Entry point name on the module. If omitted and the module exposes exactly
     * one entry, that entry is used automatically. If several entries exist, the
     * name must be supplied — passing an unknown name renders an error notice.
     * If `entry` is omitted and the module has no entry points, it falls back to
     * the legacy `component` field; passing `entry` to such a module instead
     * renders the notice so misconfiguration is surfaced.
     */
    entry: { type: String, default: undefined },
    input: { type: null as unknown as PropType<unknown>, default: undefined },
    /**
     * Opaque route id threaded through to `onExit` so a shell can tell two
     * routes apart when they render the same `(moduleId, entry)`.
     */
    routeId: { type: String, default: undefined },
    /**
     * Optional handler for history-style back navigation. Unset by default
     * because routes delegate history to the router; pass one when the entry's
     * component needs to call `goBack` (e.g. mapping to `router.back()`).
     */
    goBack: { type: Function as PropType<() => void>, default: undefined },
    /**
     * Called when the module emits an exit. Runs *before* the provider's global
     * `onExit` dispatcher, so the shell can navigate the router first and let
     * the provider hook forward to analytics / starting a journey / opening a
     * tab.
     */
    onExit: {
      type: Function as PropType<(event: ModuleRouteExitEvent) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const mod = props.module;
    const entryPoints = mod.entryPoints;
    const entryNames = entryPoints ? Object.keys(entryPoints) : [];

    let resolvedName: string | undefined = props.entry;
    let missingEntryNotice: string | null = null;
    if (props.entry === undefined) {
      if (entryNames.length === 1) {
        resolvedName = entryNames[0];
      } else if (entryNames.length > 1) {
        missingEntryNotice = `Module "${mod.id}" exposes multiple entries (${entryNames.join(", ")}); pass the \`entry\` prop to disambiguate.`;
      }
    } else if (entryPoints && !(props.entry in entryPoints)) {
      missingEntryNotice = `Module "${mod.id}" has no entry "${props.entry}". Registered: ${entryNames.join(", ") || "(none)"}.`;
    } else if (!entryPoints) {
      resolvedName = undefined;
      missingEntryNotice = `Module "${mod.id}" has no entry points; \`entry="${props.entry}"\` cannot be resolved.`;
    }

    const entryPoint = resolvedName ? entryPoints?.[resolvedName] : undefined;

    const exit = useModuleExit(mod.id, resolvedName ?? "", {
      routeId: props.routeId,
      localOnExit: props.onExit,
    });

    return () => {
      let content: VNode;
      if (missingEntryNotice) {
        content = h("div", { style: noticeStyle }, missingEntryNotice);
      } else if (entryPoint) {
        const Component = (entryPoint as EagerModuleEntryPoint<unknown>).component as Parameters<
          typeof h
        >[0];
        content = h(Component, {
          input: props.input as ModuleEntryProps<unknown>["input"],
          exit,
          ...(props.goBack ? { goBack: props.goBack } : {}),
        });
      } else if (mod.component) {
        content = h(mod.component as Parameters<typeof h>[0], {
          input: props.input,
          routeId: props.routeId,
        });
      } else {
        content = h(
          "div",
          { style: noticeStyle },
          `Module "${mod.id}" has no entry points and no component.`,
        );
      }
      return h(ModuleErrorBoundary, { moduleId: mod.id }, { default: () => content });
    };
  },
});
