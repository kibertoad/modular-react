import { defineComponent, inject, provide, type InjectionKey, type PropType } from "vue";
import type { CompositionRuntime } from "@modular-frontend/compositions-engine";

/**
 * Shell-level context read by `<CompositionOutlet>` (PR-34) and the host
 * `useComposition` composable so callers don't have to thread `runtime`
 * through every container that mounts a composition. The Vue analog of the
 * React `CompositionProviderValue`.
 *
 * Parallel to `JourneyProviderValue`. Unlike the journey provider, the
 * composition provider intentionally does not compose over a
 * `<ModuleExitProvider>` — composition panels emit via `useCompositionEmit`,
 * not via the global module-exit dispatcher.
 */
export interface CompositionProviderValue {
  readonly runtime: CompositionRuntime;
}

/**
 * Injection key holding the current {@link CompositionProviderValue}, or `null`
 * when no `<CompositionsProvider>` is mounted. Exported so tests and advanced
 * hosts can provide the context directly.
 */
export const compositionsKey: InjectionKey<CompositionProviderValue> = Symbol(
  "modular-vue.compositions",
);

/**
 * Provides the composition runtime to descendant `<CompositionOutlet>` nodes
 * and host `useComposition` callers. Wired automatically by the
 * `compositionsPlugin()` factory so shells that opt in via
 * `registry.use(compositionsPlugin())` get this for free; standalone consumers
 * can mount it directly.
 *
 * Authored with `defineComponent` + a render function (no SFC compiler in the
 * package build; see decision D4). The `runtime` is provided by identity at
 * setup — matching the modules / navigation / journey contexts, it is resolved
 * once from the manifest and does not swap on the same mount, and it is left
 * un-proxied so identity checks against `manifest.extensions.compositions`
 * hold. This is also why descendant `useCompositionsContext()` consumers never
 * churn: the React binding memoizes the value object on `runtime` to avoid a
 * context fan-out on every parent re-render; the Vue provider gets the same
 * guarantee for free because the value is a stable object captured once at
 * setup.
 */
export const CompositionsProvider = defineComponent({
  name: "CompositionsProvider",
  props: {
    /** Composition runtime — usually `manifest.extensions.compositions`. */
    runtime: { type: Object as PropType<CompositionRuntime>, required: true },
  },
  setup(props, { slots }) {
    const value: CompositionProviderValue = { runtime: props.runtime };
    provide(compositionsKey, value);
    return () => slots.default?.();
  },
});

/** Read the current provider value, or `null` when none is mounted. */
export function useCompositionsContext(): CompositionProviderValue | null {
  return inject(compositionsKey, null);
}
