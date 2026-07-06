import {
  defineComponent,
  inject,
  provide,
  toValue,
  type InjectionKey,
  type MaybeRefOrGetter,
  type PropType,
} from "vue";
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
 * Injection key holding a *getter* for the nearest module-exit dispatcher.
 * A getter (rather than the handler value) keeps the injection reactive: the
 * provider can swap its `onExit` prop after mount and descendants read the
 * current handler — the React analog re-provides a memoized context value
 * whenever `onExit` changes. Absent when no {@link ModuleExitProvider} is
 * mounted; `useModuleExitDispatcher` then reads `undefined`.
 */
export const moduleExitKey: InjectionKey<() => ModuleExitHandler | undefined> =
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
 * The dispatcher is provided as a getter over the live `onExit` prop, so
 * swapping the handler after mount (e.g. `:onExit="isAuthed ? a : b"`) is
 * visible to descendant hosts — matching the React provider, which re-memoizes
 * its context value whenever `onExit` changes.
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
    // Provide a getter (not the raw value) so a later `onExit` swap reaches
    // descendants; a raw value would snapshot at setup and go stale.
    provide(moduleExitKey, () => props.onExit);
    return () => slots.default?.();
  },
});

/** Read the current module-exit dispatcher, or `undefined` when none is mounted. */
export function useModuleExitDispatcher(): ModuleExitHandler | undefined {
  return inject(moduleExitKey, undefined)?.();
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
 * `moduleId`, `entry`, and the options accept a plain value, a ref, or a
 * getter ({@link MaybeRefOrGetter}). Because `setup` runs once, a host whose
 * `(moduleId, entry, routeId, onExit)` can change on the *same* instance
 * (e.g. a `<router-view>`-hosted route reused across navigation) should pass
 * getters so the emitted event and the local handler track the current props —
 * the React analog rebinds via its `useMemo` dependency list. Plain values
 * still work unchanged for hosts whose binding is fixed for the mount.
 *
 * The dispatcher getter is resolved once via `inject` at setup time
 * (composables must run synchronously in `setup`) but is *invoked* on each
 * exit, so a swapped provider handler is picked up too.
 */
export function useModuleExit<TExits extends ExitPointMap = ExitPointMap>(
  moduleId: MaybeRefOrGetter<string>,
  entry: MaybeRefOrGetter<string>,
  options: {
    readonly tabId?: MaybeRefOrGetter<string | undefined>;
    readonly routeId?: MaybeRefOrGetter<string | undefined>;
    readonly localOnExit?: MaybeRefOrGetter<ModuleExitHandler | undefined>;
  } = {},
): ExitFn<TExits> {
  const dispatcher = inject(moduleExitKey, undefined);
  return ((exitName: string, output?: unknown) => {
    const event: ModuleExitEvent = {
      moduleId: toValue(moduleId),
      entry: toValue(entry),
      exit: exitName,
      output,
      tabId: toValue(options.tabId),
      routeId: toValue(options.routeId),
    };
    toValue(options.localOnExit)?.(event);
    dispatcher?.()?.(event);
  }) as ExitFn<TExits>;
}
