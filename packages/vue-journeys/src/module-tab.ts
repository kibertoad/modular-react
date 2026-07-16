import {
  computed,
  defineComponent,
  h,
  Suspense,
  toRaw,
  type Component,
  type PropType,
  type VNode,
} from "vue";
import type { ModuleDescriptor } from "@modular-frontend/core";
import {
  ModuleErrorBoundary,
  resolveEntryComponent,
  useModuleExit,
  type ModuleExitEvent,
} from "@modular-vue/vue";

/**
 * Exit event fired by a module rendered inside a `<ModuleTab>`.
 *
 * Alias for {@link ModuleExitEvent} from `@modular-vue/vue` — kept as a named
 * export for the workspace-tab entry point so existing imports keep compiling.
 * Both types have the same shape.
 */
export type ModuleTabExitEvent = ModuleExitEvent;

interface EntryResolution {
  readonly resolvedName: string | undefined;
  readonly missingEntryNotice: string | null;
}

/**
 * Resolve the entry name for a `<ModuleTab>` from its module + optional `entry`
 * prop, matching the React source's rules: auto-pick a lone entry, require
 * disambiguation for a multi-entry module, surface a notice for an unknown
 * entry, and refuse to fall through to the legacy `component` when an explicit
 * `entry` is passed to a module with no entry points.
 */
function resolveEntryName(
  mod: ModuleDescriptor<any, any, any, any>,
  entry: string | undefined,
): EntryResolution {
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
  } else if (entryPoints && !Object.prototype.hasOwnProperty.call(entryPoints, entry)) {
    missingEntryNotice = `Module "${mod.id}" has no entry "${entry}". Registered: ${entryNames.join(", ") || "(none)"}.`;
  } else if (!entryPoints) {
    // `entry` requested but module exposes no entry points at all — surface
    // the misconfiguration instead of silently falling through to the legacy
    // `component` path.
    resolvedName = undefined;
    missingEntryNotice = `Module "${mod.id}" has no entry points; \`entry="${entry}"\` cannot be resolved.`;
  }
  return { resolvedName, missingEntryNotice };
}

function notice(message: string): VNode {
  return h("div", { style: { padding: "1rem", color: "#c53030" } }, message);
}

/**
 * Host for a single module instance rendered outside any route — in a tab,
 * modal, or panel. Default exit behavior delegates to the `onExit` callback
 * provided by the shell; the module itself stays journey-unaware. The Vue
 * analog of the React `<ModuleTab>`.
 *
 * Authored with `defineComponent` + a render function (no SFC compiler in the
 * package build; see decision D4). The exit binding is created once at setup
 * via `useModuleExit` (Vue composables must run synchronously in `setup`),
 * reading the current module id / resolved entry through getters so a host that
 * swaps `module`/`entry` on the same instance still emits the right event.
 *
 * `inheritAttrs` is disabled and `input` is read from `attrs` so the component
 * can tell "no `input` prop" apart from an explicit `input={undefined}` — Vue
 * collapses both to `undefined` for a *declared* prop (an explicit `undefined`
 * triggers the prop default), so the presence check has to look at the raw
 * attrs bag, the analog of the React source's `"input" in props`.
 */
export const ModuleTab = defineComponent({
  name: "ModuleTab",
  inheritAttrs: false,
  props: {
    /** Full module descriptor — the shell looks this up by id. */
    module: {
      type: Object as PropType<ModuleDescriptor<any, any, any, any>>,
      required: true,
    },
    /**
     * Entry point name on the module. If omitted and the module exposes exactly
     * one entry, that entry is used automatically. If the module exposes several
     * entries, the name must be supplied — passing an unknown name renders an
     * error notice. If `entry` is omitted and the module has no entry points,
     * the component falls back to the legacy `component` field; passing `entry`
     * to such a module instead renders the error notice so misconfiguration is
     * surfaced.
     */
    entry: { type: String, default: undefined },
    /** Opaque tab id threaded through to `onExit` for the shell to close it. */
    tabId: { type: String, default: undefined },
    /**
     * Called when the module emits an exit. Runs *before* the provider's global
     * `onExit` dispatcher (via `<ModuleExitProvider>`, typically composed under
     * `<JourneyProvider>`), so the shell can close the tab first and let the
     * provider hook forward to analytics / routing.
     */
    onExit: { type: Function as PropType<(event: ModuleTabExitEvent) => void>, default: undefined },
  },
  setup(props, { attrs }) {
    // Unwrap the reactive prop proxy: Vue deeply proxies prop objects, which
    // would change the entry-object identity that keys `resolveEntryComponent`'s
    // per-entry `WeakMap` cache — breaking preload/render chunk sharing and the
    // memoized async wrapper. `toRaw` restores the descriptor the runtime and
    // preload paths hold.
    const rawModule = () => toRaw(props.module);
    const resolution = computed(() => resolveEntryName(rawModule(), props.entry));

    // Hook binding must be created once at setup — always bind, even when the
    // entry is missing. When missing, the returned `exit` is never invoked
    // because we render the error notice instead.
    const exit = useModuleExit(
      () => props.module.id,
      () => resolution.value.resolvedName ?? "",
      {
        tabId: () => props.tabId,
        localOnExit: () => props.onExit,
      },
    );

    return () => {
      const mod = rawModule();
      const { resolvedName, missingEntryNotice } = resolution.value;
      const entryPoint = resolvedName ? mod.entryPoints?.[resolvedName] : undefined;

      let content: VNode | null;
      if (missingEntryNotice) {
        content = notice(missingEntryNotice);
      } else if (entryPoint) {
        // The entry's declared input schema is the source of truth for whether
        // `input` is required. At runtime we don't reflect on the schema, but
        // we can still refuse to render with a visibly wrong `undefined` when
        // the caller forgot to pass it — that surfaces the misconfiguration
        // instead of letting the component throw deep inside its render.
        // Callers whose entry schema is `void` should pass `input={undefined}`
        // explicitly.
        const hasInput = "input" in attrs;
        const input = (attrs as Record<string, unknown>).input;
        if (input === undefined && !hasInput) {
          content = notice(
            `Module "${mod.id}" entry "${resolvedName ?? ""}" was rendered without an \`input\` prop. ` +
              `Pass \`input={undefined}\` explicitly if the entry accepts no input.`,
          );
        } else {
          const { Component } = resolveEntryComponent(entryPoint);
          const fallback = (entryPoint as { fallback?: VNode | (() => VNode) }).fallback;
          content = h(Suspense, null, {
            default: () => h(Component, { input, exit }),
            fallback: () => (typeof fallback === "function" ? fallback() : (fallback ?? null)),
          });
        }
      } else if (mod.component) {
        // Back-compat: render the legacy workspace component when the module
        // exposes no entry points. Entry contracts are opt-in.
        const Legacy = mod.component as Component;
        const input = (attrs as Record<string, unknown>).input;
        content = h(Legacy, { input, tabId: props.tabId });
      } else {
        content = notice(`Module "${mod.id}" has no entry points and no component.`);
      }

      return h(ModuleErrorBoundary, { moduleId: mod.id }, () => content);
    };
  },
});
