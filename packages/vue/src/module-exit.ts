import { defineComponent, inject, provide, type InjectionKey, type PropType } from "vue";
import type { ExitFn, ExitPointMap } from "@modular-frontend/core";

/**
 * Event fired when a module entry emits an exit outside a journey context.
 *
 * Exactly one of `tabId` / `routeId` is expected to be set — `tabId` when the
 * host is a workspace tab, `routeId` when the host is a `<ModuleRoute>`. Both
 * are omitted for ad-hoc `useModuleExit` callers (modals, panels) that aren't
 * scoped to a tab or a route.
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
 * hosted outside a journey (via a workspace tab, `<ModuleRoute>`, or any host
 * that uses {@link useModuleExit}).
 *
 * This is the "step 0" plumbing: a module entry can fire an exit from a
 * standalone context, and the composition root decides what it means —
 * typically starting a journey, opening a tab, or routing somewhere.
 */
export type ModuleExitHandler = (event: ModuleExitEvent) => void;

/**
 * Injection key holding the nearest module-exit dispatcher. Absent when no
 * {@link ModuleExitProvider} is mounted; `useModuleExitDispatcher` then reads
 * `undefined`.
 */
export const moduleExitKey: InjectionKey<ModuleExitHandler | undefined> =
  Symbol("modular-vue.moduleExit");

/**
 * Provides a shell-level `onExit` dispatcher to descendant module hosts.
 * Analog of the React `<ModuleExitProvider>`.
 *
 * Independent of the journeys plugin: a shell using only modules can mount
 * this provider and wire `onExit` to app-level intents (open modal, switch
 * workspace, start a journey). Authored with `defineComponent` + a render
 * function (no SFC compiler in the package build; see decision D4).
 *
 * The handler is provided by identity as captured at setup — a stable value
 * for the lifetime of the provider, matching how the other injection contexts
 * (modules, navigation) are set once at resolve time.
 */
export const ModuleExitProvider = defineComponent({
  name: "ModuleExitProvider",
  props: {
    /**
     * Global dispatcher invoked whenever a descendant module entry emits an
     * exit. Keep this handler at the composition root so wiring is visible
     * in one place.
     */
    onExit: { type: Function as PropType<ModuleExitHandler>, default: undefined },
  },
  setup(props, { slots }) {
    provide(moduleExitKey, props.onExit);
    return () => slots.default?.();
  },
});

/** Read the current module-exit dispatcher, or `undefined` when none is mounted. */
export function useModuleExitDispatcher(): ModuleExitHandler | undefined {
  return inject(moduleExitKey, undefined);
}

/**
 * Build an `exit` callback bound to a specific `(moduleId, entry)` that
 * forwards every call to the nearest {@link ModuleExitProvider}'s handler.
 *
 * Typed the same way the journey outlet types its `exit` prop — the returned
 * function is a fully typed `ExitFn<TExits>` for the module's exit map. Pass
 * `tabId` when the host represents a workspace tab, or `routeId` when the host
 * is a route. At most one of the two should be supplied; the event shape
 * allows both to be absent for ad-hoc callers.
 *
 * The dispatcher is resolved once via `inject` at setup time (composables must
 * run synchronously in `setup`), so the returned callback is a stable closure.
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
  return ((exitName: string, output?: unknown) => {
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
  }) as ExitFn<TExits>;
}
