import {
  computed,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  shallowRef,
  toRaw,
  type ComputedRef,
  type PropType,
  type ShallowRef,
  type VNode,
} from "vue";

import type {
  InstanceId,
  JourneyHandle,
  JourneyInstance,
  JourneyRuntime,
} from "@modular-frontend/journeys-engine";

import { useInstanceSnapshot } from "./instance-hooks.js";
import { JourneyOutlet } from "./outlet.js";
import { useJourneyContext } from "./provider.js";

/**
 * Tracks which host mount currently owns each started instance, so an
 * unmounting host's deferred teardown does not end and forget an instance a
 * same-tick replacement host has already resumed. With persistence,
 * `runtime.start()` returns the same id for the same input, so a route change
 * that unmounts one host and mounts another for the same journey hands the
 * live instance across — and the outgoing host's queued `end`/`forget` must
 * not fire against it. Keyed by runtime (a `WeakMap`, so it drops when the
 * runtime is collected) then by instance id.
 *
 * The value is a **set** of owner tokens, not a single one: two hosts can be
 * mounted on the same persisted id at once (concurrently, or across a route
 * swap), and only when the last of them unmounts should the instance be ended
 * and forgotten. A single "latest owner" would let the newer host, unmounting
 * first, tear the instance down while the older one is still showing it.
 */
const hostOwners = new WeakMap<JourneyRuntime, Map<InstanceId, Set<symbol>>>();

function ownersFor(runtime: JourneyRuntime): Map<InstanceId, Set<symbol>> {
  let owners = hostOwners.get(runtime);
  if (!owners) {
    owners = new Map();
    hostOwners.set(runtime, owners);
  }
  return owners;
}

export interface UseJourneyHostOptions {
  /**
   * Runtime to start the journey on. Optional when a `<JourneyProvider>` is
   * mounted above — the composable reads the runtime from context in that case.
   */
  readonly runtime?: JourneyRuntime;
}

export interface JourneyHostState {
  /**
   * The instance this host owns. `null` until the component is mounted — the
   * journey is started from `onMounted`, so it does not exist during the first
   * render. `<JourneyHost>` renders `loadingFallback` for that frame.
   */
  readonly instanceId: ShallowRef<InstanceId | null>;
  readonly instance: ShallowRef<JourneyInstance | null>;
  /**
   * The runtime this host resolved at setup — the one `instanceId` is
   * meaningful to, and the one the host's own `<JourneyOutlet>` is given.
   * Already `toRaw`-unwrapped.
   *
   * Normally identical to whatever a `<JourneyProvider>` above you would hand
   * out, so a hand-placed outlet can keep resolving from context. It is
   * exposed for the case where those two could differ: a shell that swaps its
   * provider value mid-flight. The host does not follow such a swap (see
   * "read once, at setup"), so this is the runtime to use if you want to be
   * certain you are talking about the same journey the host started.
   */
  readonly runtime: JourneyRuntime;
  /**
   * How many steps the user has completed — `history.length`, so `0` on the
   * first step. Rewinds when the journey does.
   *
   * There is deliberately no `stepCount` here. The total is not knowable from
   * a running instance: a journey's next step is computed by a transition
   * handler from live state, so nothing short of walking the transition graph
   * can count the steps ahead — and a hand-passed total is exactly the
   * duplicated flow encoding this API exists to remove. Deriving it from the
   * graph is tracked separately.
   */
  readonly stepIndex: ComputedRef<number>;
}

/**
 * Own a journey instance for the lifetime of a component: start it on mount,
 * end and forget it on unmount. The Vue analog of the React
 * `useJourneyHost`.
 *
 * This is the lifecycle half of "mount a journey"; `useJourneySync` is the URL
 * half, and `<JourneyOutlet>` is the rendering half. {@link JourneyHost}
 * packages the first and the last together.
 *
 * **`handle`, `input` and `runtime` are read once, at setup**, and are
 * therefore plain values rather than the `MaybeRefOrGetter` the reactive
 * composables in this package take. Changing them cannot restart the journey:
 * silently abandoning a half-finished flow because a prop changed is never
 * what the caller meant. To run a different journey — or to run it on a
 * different runtime — remount: `<JourneyHost :key="journeyId" …>`. The React
 * binding pins its runtime the same way.
 *
 * **Start means resume, when persistence is configured.** `runtime.start()`
 * with a `persistence` adapter returns the in-flight instance for the same
 * `keyFor(input)` rather than minting a new one, so a host that remounts (a
 * route change, a tab switch) picks the journey back up where it was. Without
 * persistence every mount starts a fresh instance.
 */
export function useJourneyHost<TInput>(
  handle: JourneyHandle<string, TInput, unknown>,
  input: TInput,
  options: UseJourneyHostOptions = {},
): JourneyHostState {
  const ctx = useJourneyContext();
  // `toRaw` for the same reason the outlet does it — `getInternals` keys its
  // store on the raw runtime identity, and a runtime that arrived through a
  // reactive prop is a proxy.
  const runtime = toRaw(options.runtime ?? ctx?.runtime ?? undefined) ?? null;
  if (!runtime) {
    throw new Error(
      "[@modular-vue/journeys] useJourneyHost needs a runtime. Either pass `runtime` or mount a <JourneyProvider>.",
    );
  }

  const instanceId = shallowRef<InstanceId | null>(null);
  // Unique per host mount — see `hostOwners`.
  const ownerToken = Symbol("journey-host");

  onMounted(() => {
    // Started from `onMounted` rather than `setup` so the start is guaranteed
    // to be paired with an `onUnmounted` that ends it. A component whose
    // `setup` ran but whose mount never completed (an ancestor threw first,
    // an async boundary discarded the branch) would otherwise leak a live
    // instance nothing owns. Also keeps the observable contract identical to
    // the React binding's.
    //
    // The string-id overload: the handle form's `...rest` tuple cannot be
    // satisfied from a generic `TInput` without widening the call site.
    // `handle.id` is the same value the handle overload reads.
    const id = runtime.start(handle.id, input);
    instanceId.value = id;
    // Claim ownership of the id by adding this mount's token to the id's owner
    // set (creating it on first mount).
    const owners = ownersFor(runtime);
    let ownerSet = owners.get(id);
    if (!ownerSet) {
      ownerSet = new Set();
      owners.set(id, ownerSet);
    }
    ownerSet.add(ownerToken);
  });

  onUnmounted(() => {
    const id = instanceId.value;
    if (!id) return;
    instanceId.value = null;
    const owners = ownersFor(runtime);
    // Deferred one microtask, matching `<JourneyOutlet>`: an inner outlet
    // schedules its own abandon the same way, and reading the record after
    // both have settled keeps the two from racing.
    queueMicrotask(() => {
      const set = owners.get(id);
      if (!set) return;
      // Drop this host's claim. Only tear down when no host still owns the id —
      // another host may share it (a route swap resuming the same persisted
      // instance, or two concurrent hosts), and it would keep showing the
      // instance we would otherwise end and forget.
      set.delete(ownerToken);
      if (set.size > 0) return;
      owners.delete(id);
      // `end` first, then `forget`: `forget` is a no-op on an instance that is
      // still active, and `end` is synchronous, so this ordering both aborts
      // the run and drops the record. An inner `<JourneyOutlet>` may have
      // already ended it — `end` no-ops on a terminal instance, so the race is
      // harmless in either order.
      runtime.end(id, { reason: "unmounted" });
      runtime.forget(id);
    });
  });

  const instance = useInstanceSnapshot(runtime, instanceId);

  return {
    instanceId,
    instance,
    runtime,
    stepIndex: computed(() => (instance.value ? instance.value.history.length : 0)),
  };
}

/**
 * Pull `loadingFallback` out of the host's attrs, accepting either spelling.
 *
 * Vue camelizes kebab-case only for **declared** props; a fallthrough attr
 * keeps whatever key the caller wrote. So a template's
 * `:loading-fallback="…"` arrives as `attrs["loading-fallback"]` while a
 * render function's `h(JourneyHost, { loadingFallback })` arrives camelCased,
 * and the host — which reads this attr itself rather than declaring it — has
 * to look under both. The inner `<JourneyOutlet>` needs no such help: it
 * *declares* `loadingFallback`, so Vue normalizes the kebab key for it.
 *
 * Without this the template spelling renders nothing for the frame before the
 * instance exists, then silently starts working once the outlet mounts.
 */
function readLoadingFallback(attrs: Record<string, unknown>): VNode | (() => VNode) | undefined {
  return (attrs.loadingFallback ?? attrs["loading-fallback"]) as VNode | (() => VNode) | undefined;
}

export interface JourneyHostSlotProps {
  readonly instanceId: InstanceId;
  readonly instance: JourneyInstance;
  /** See {@link JourneyHostState.stepIndex}. */
  readonly stepIndex: number;
  /**
   * The `<JourneyOutlet>` for this instance, already built with every outlet
   * attribute passed to `<JourneyHost>`. Place it inside your chrome.
   */
  readonly outlet: VNode;
}

/**
 * Mount a journey in one line:
 * `<JourneyHost :handle="checkoutHandle" :input="{ cartId }" />`.
 *
 * Starts the journey on mount, renders its current step, and ends + forgets
 * the instance on unmount — the wrapper every journey host ends up writing.
 * The Vue analog of the React `<JourneyHost>`.
 *
 * **Outlet props pass through as attributes.** `inheritAttrs: false` plus an
 * attrs spread onto the inner `<JourneyOutlet>` means every outlet prop
 * (`onFinished`, `onStepError`, `errorComponent`, `preload`, …) works on
 * `<JourneyHost>` without this component re-declaring — and drifting from —
 * the outlet's prop list. `loadingFallback` is the one attr the host also
 * reads itself, to cover the render before the instance exists — which is why
 * it has to accept both spellings; see {@link readLoadingFallback}.
 *
 * For chrome around the step, use the default scoped slot:
 *
 * ```vue
 * <JourneyHost :handle="checkoutHandle" :input="{ cartId }" @finished="goToReceipt">
 *   <template #default="{ stepIndex, outlet }">
 *     <Layout title="Checkout" :step="stepIndex">
 *       <component :is="outlet" />
 *     </Layout>
 *   </template>
 * </JourneyHost>
 * ```
 *
 * To deep-link the steps, call `useJourneySync` in the same component — the
 * host owns the instance, the sync owns the URL, and neither knows about the
 * other.
 *
 * See {@link useJourneyHost} for the lifecycle rules (the instance is fixed
 * for the host's lifetime; `start` resumes when persistence is configured).
 */
export const JourneyHost = defineComponent({
  name: "JourneyHost",
  inheritAttrs: false,
  props: {
    handle: {
      type: Object as PropType<JourneyHandle<string, any, any>>,
      required: true,
    },
    /**
     * The journey's `input`. Typed `any` because a `defineComponent` prop
     * list cannot carry the handle's `TInput` through — reach for
     * {@link useJourneyHost} in a `<script setup>` block when you want the
     * input checked against the handle.
     */
    input: { type: null as unknown as PropType<any>, default: undefined },
    /**
     * Runtime to start the journey on, forwarded to the outlet. Optional when
     * a `<JourneyProvider>` is mounted above.
     */
    runtime: { type: Object as PropType<JourneyRuntime>, default: undefined },
  },
  setup(props, { slots, attrs }) {
    const { instanceId, instance, runtime, stepIndex } = useJourneyHost(props.handle, props.input, {
      runtime: props.runtime,
    });

    return () => {
      const id = instanceId.value;
      const inst = instance.value;
      if (!id || !inst) {
        const fallback = readLoadingFallback(attrs);
        if (!fallback) return null;
        return typeof fallback === "function" ? fallback() : fallback;
      }

      // The resolved runtime, not `props.runtime`: `instanceId` only means
      // anything on the runtime the host started it on, so forwarding a later
      // prop value would point the outlet at a runtime that has never heard of
      // this instance.
      const outlet = h(JourneyOutlet, { ...attrs, runtime, instanceId: id });
      const slot = slots.default;
      if (!slot) return outlet;
      return slot({
        instanceId: id,
        instance: inst,
        stepIndex: stepIndex.value,
        outlet,
      } satisfies JourneyHostSlotProps);
    };
  },
});
