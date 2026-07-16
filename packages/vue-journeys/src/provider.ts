import { defineComponent, h, inject, provide, type InjectionKey, type PropType } from "vue";
import { ModuleExitProvider } from "@modular-vue/vue";
import type { ModuleExitEvent, ModuleExitHandler } from "@modular-vue/vue";

import type { JourneyRuntime } from "@modular-frontend/journeys-engine";

/**
 * Shell-level context read by `<JourneyOutlet>` (PR-31) and the instance
 * composables so callers don't have to thread `runtime` through every
 * container that hosts a journey. Analog of the React `JourneyContext` value.
 *
 * `onModuleExit` is still surfaced here for consumers that introspect the
 * provider value. The actual dispatch flows through `<ModuleExitProvider>`
 * from `@modular-vue/vue`, which `<JourneyProvider>` mounts automatically.
 * Prefer consuming `useModuleExit` / `useModuleExitDispatcher` from the vue
 * package directly in new code.
 */
export interface JourneyProviderValue {
  /** Journey runtime — usually `manifest.journeys`. */
  readonly runtime: JourneyRuntime;
  /**
   * Optional fallback invoked by module hosts (`<ModuleRoute>`, tabs) after
   * any local `onExit` prop has run. Wiring this at the provider level gives a
   * shell global telemetry / tab-close forwarding without threading the
   * callback through every host.
   */
  readonly onModuleExit?: (event: ModuleExitEvent) => void;
}

/**
 * Injection key holding the current {@link JourneyProviderValue}, or `null`
 * when no `<JourneyProvider>` is mounted. Exported so tests and advanced hosts
 * can provide the context directly.
 */
export const journeyKey: InjectionKey<JourneyProviderValue> = Symbol("modular-vue.journey");

/**
 * Provides the journey runtime to descendant journey hosts, and composes over
 * `<ModuleExitProvider>` so module hosts (`<ModuleRoute>`, anything using
 * `useModuleExit`) see the shell's `onModuleExit` dispatcher without needing a
 * second provider.
 *
 * Authored with `defineComponent` + a render function (no SFC compiler in the
 * package build; see decision D4). The context is provided by identity at
 * setup — matching the modules / navigation contexts (PR-10), the runtime is
 * resolved once from the manifest and does not swap on the same mount. The
 * `onModuleExit` handler is forwarded through the live `props` into
 * `<ModuleExitProvider>` on every render, so a swapped handler still reaches
 * descendant hosts (the provider reads it through a getter).
 *
 * Existing journey consumers do not need to change — `onModuleExit` keeps
 * firing for every module exit emitted outside a journey step.
 */
export const JourneyProvider = defineComponent({
  name: "JourneyProvider",
  props: {
    /** Journey runtime — usually `manifest.journeys`. */
    runtime: { type: Object as PropType<JourneyRuntime>, required: true },
    /** Shell-wide fallback dispatcher for module exits fired outside a step. */
    onModuleExit: { type: Function as PropType<ModuleExitHandler>, default: undefined },
  },
  setup(props, { slots }) {
    provide(journeyKey, { runtime: props.runtime, onModuleExit: props.onModuleExit });
    return () => h(ModuleExitProvider, { onExit: props.onModuleExit }, () => slots.default?.());
  },
});

/** Read the current provider value, or `null` when none is mounted. */
export function useJourneyContext(): JourneyProviderValue | null {
  return inject(journeyKey, null);
}
