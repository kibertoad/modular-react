import {
  computed,
  defineComponent,
  h,
  inject,
  onErrorCaptured,
  onMounted,
  onScopeDispose,
  onUnmounted,
  onUpdated,
  provide,
  ref,
  shallowRef,
  Suspense,
  toRaw,
  watch,
  type Component,
  type InjectionKey,
  type PropType,
  type ShallowRef,
  type VNode,
} from "vue";
import { isDevEnv } from "@modular-frontend/core";
import type { ModuleDescriptor } from "@modular-frontend/core";
import { resolveEntryComponent } from "@modular-vue/vue";

import { getInternals } from "@modular-frontend/compositions-engine";
import { compositionsKey } from "./provider.js";
import { compositionInstanceKey } from "./hooks.js";
import type { CompositionContextValue } from "./hooks.js";
import type {
  CompositionInstance,
  CompositionInstanceId,
  CompositionRuntime,
  CompositionZoneEvent,
  CompositionZoneDescriptor,
  CompositionZoneResolution,
} from "@modular-frontend/compositions-engine";
import {
  createCompositionZoneStores,
  noopCompositionZoneStores,
  type CompositionZoneStores,
} from "@modular-frontend/compositions-engine";

/** Default cap on automatic retries before a zone falls back. */
const DEFAULT_RETRY_CAP = 2;

/**
 * Hard cap on how deep a composition definition can nest inside itself before
 * we treat the chain as a cycle. Bound on the upper end of any plausible
 * real-world layout (sub-editors etc. tend to be 2-3 deep). Anything beyond is
 * almost certainly a journey ↔ composition loop that bounces through
 * *different* instance ids of the same definition — same logical recursion the
 * same-instance guard catches, just laundered through fresh ids.
 */
const DEFAULT_DEFINITION_DEPTH_CAP = 8;

/**
 * Sentinel used by the zone's state read to mean "the instance record / store
 * has disappeared mid-disposal". Using a unique Symbol (rather than `null` or
 * `undefined`) keeps the path distinguishable from a composition whose state is
 * *legitimately* `null`/`undefined`, so the selector still runs for such states
 * instead of silently falling through to an `{ kind: "empty" }` zone.
 */
const STATE_UNAVAILABLE = Symbol("composition-state-unavailable");

/**
 * Composition ancestry tracked in the Vue component tree:
 *   - `instances` — instance ids currently rendering above this outlet. A hit
 *     here is treated as a hard cycle (we render the error fallback in place of
 *     the offending outlet) because the composition would otherwise
 *     infinite-loop into a stack overflow.
 *   - `definitionDepth` — number of times each composition id appears in the
 *     chain regardless of instance id. Two parallel instances of the same
 *     definition (e.g. side-by-side documents) is a legitimate pattern and
 *     stays under the depth cap; a journey↔composition loop that re-opens the
 *     same definition under a fresh id every iteration hits the cap quickly and
 *     produces the error fallback instead of a stack overflow.
 *
 * The detection is partial across the journey ↔ composition boundary:
 * `@modular-vue/journeys` runs its own parent-link cycle check for
 * journey-to-journey invocations, but it does not see composition ancestors.
 * The same-instance guard catches the trivial case; the depth-cap guard catches
 * the cross-instance variant. The Vue analog of the React
 * `CompositionAncestryContext`, threaded via provide/inject.
 */
interface CompositionAncestry {
  readonly instances: ReadonlySet<CompositionInstanceId>;
  readonly definitionDepth: ReadonlyMap<string, number>;
}
const compositionAncestryKey: InjectionKey<CompositionAncestry> = Symbol(
  "modular-vue.composition-ancestry",
);

export interface CompositionOutletNotFoundProps {
  readonly zone: string;
  readonly moduleId: string;
  readonly entry: string;
}

export interface CompositionOutletErrorProps {
  readonly zone: string;
  readonly error: unknown;
}

/** Normalize a `VNode | (() => VNode)` fallback prop to a renderable VNode. */
function renderFallback(fb: VNode | (() => VNode) | undefined): VNode | null {
  return (typeof fb === "function" ? fb() : fb) ?? null;
}

/**
 * Dispatch placeholder for selector invocations on the preload path. Preload
 * only reads `module`/`entry` off the resulting resolution; any `dispatch`-
 * driven callbacks the selector bakes into `input` are never invoked from
 * preload, so a stable no-op is correct here. Shared (not inlined) so
 * identity-equality across preload runs doesn't fluctuate.
 */
const noopDispatch: (updater: unknown) => void = () => {};

/**
 * Stores placeholder for selector invocations on the preload path. Same
 * rationale as {@link noopDispatch} — preload never invokes any store baked
 * into `input`, so a stub provider is correct and avoids holding a real runtime
 * + instance handle on a path that doesn't need them. Cast to widen
 * `unknown` → `any` so the unified noop satisfies the per-`TState`
 * `CompositionZoneStores` contract.
 */
const noopStores = noopCompositionZoneStores as unknown as CompositionZoneStores<any>;

/**
 * Stable string hash of a structural input, used as a cache key for journey
 * instance caching and as the input-fingerprint suffix in the resolution
 * selection key. Order-invariant (object keys sorted) and cycle-safe.
 *
 * **Symbol keys are intentionally ignored.** `Object.keys` skips them, so two
 * inputs that differ only in symbol-keyed property values hash identically.
 * Inputs in this codebase are structural data crossing a module boundary;
 * symbol keys are a per-realm capability marker that has no business in a
 * wire-shape input. If a real scenario surfaces, extend `serializeStable` to
 * fold `Object.getOwnPropertySymbols` in sorted order alongside string keys.
 */
function hashInput(input: unknown): string {
  if (input === undefined) return "u";
  try {
    return serializeStable(input, new Set());
  } catch {
    return `<${typeof input}>`;
  }
}

function serializeStable(value: unknown, ancestors: Set<object>): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") {
    const n = value as number;
    if (Number.isFinite(n)) return String(n);
    // Use distinct sentinels so NaN / +Infinity / -Infinity all hash
    // differently — `JSON.stringify(NaN)` would collapse them all to `"null"`
    // and a cache keyed on the hash would falsely treat them as the same input.
    if (Number.isNaN(n)) return '"<nan>"';
    return n > 0 ? '"<+inf>"' : '"<-inf>"';
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t === "bigint") return `"<bigint:${(value as bigint).toString()}>"`;
  if (t === "function" || t === "symbol") return `"<${t}>"`;
  if (t !== "object") return JSON.stringify(value);
  const obj = value as object;
  if (ancestors.has(obj)) return '"<cycle>"';
  ancestors.add(obj);
  try {
    if (Array.isArray(value)) {
      const items = (value as readonly unknown[]).map((v) => serializeStable(v, ancestors));
      return `[${items.join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(k)}:${serializeStable(record[k], ancestors)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    ancestors.delete(obj);
  }
}

/**
 * Pure derivation of a stable per-resolution key. For `journey` resolutions
 * without an explicit `instanceId` we hash the input rather than the
 * runtime-minted id, so the key is stable across re-runs (the cached id may not
 * exist yet on the first render).
 */
function computeSelectionKey(
  selection: CompositionZoneResolution<any>,
  selectorError: unknown,
  modules: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>,
): string {
  if (selectorError) return "select-error";
  if (selection.kind === "empty") return "empty";
  if (selection.kind === "module-entry") {
    const mod = modules[selection.module];
    const entry = mod?.entryPoints?.[selection.entry];
    // Include `input` in the key on equal terms with the journey path so an
    // input change resets the retry counter and remounts the boundary — a stale
    // error from a previous input shouldn't survive a state change that produced
    // a different input.
    const inputSuffix = hashInput(selection.input);
    if (!mod || !entry) return `notfound:${selection.module}:${selection.entry}:${inputSuffix}`;
    return `entry:${selection.module}:${selection.entry}:${inputSuffix}`;
  }
  if (selection.kind === "journey") {
    const idSuffix = selection.instanceId ?? hashInput(selection.input);
    return `journey:${selection.handle.id}:${idSuffix}`;
  }
  return "unknown";
}

/**
 * Returns true iff the entry's `mountKinds` permits the `"composition"` host.
 * Omitted `mountKinds` defaults to "every mount surface", so existing modules
 * that never opted in still work.
 *
 * Mirrors the type-level `EntryNamesByMountKindOf` filter applied to
 * `CompositionZoneSpec`: the type-side check is the primary enforcement, this is
 * the runtime backstop against type-bypass paths (any-typed module maps, dynamic
 * ids, `as never` casts).
 */
function entryAllowsCompositionMount(entry: { readonly mountKinds?: readonly string[] }): boolean {
  if (!Array.isArray(entry.mountKinds)) return true;
  return entry.mountKinds.includes("composition");
}

// Panels rendered inside compositions don't have a direct exit channel — the
// no-op stub lets ModuleEntryProps stay structurally satisfied while the panel
// dispatches through `useCompositionDispatch` instead.
//
// The `mountKinds: ["composition"]` (or default-all) opt-in lets an entry
// legitimately mount in a composition zone even though its journey code path may
// still call `exit()`. The render-time mountKinds guard (below) rejects
// journey-only entries before they get this far, so the remaining warn cases are
// entries that *can* legally render here but whose body nonetheless dispatches
// through the (now no-op) exit channel — a real footgun in shared module code.
// Warn in dev the first time each name is observed; once per process keeps the
// diagnostic useful and quiet under repeated user actions.
const NOOP_EXIT_WARNED = new Set<string>();
const NOOP_EXIT = ((exitName?: string) => {
  if (!isDevEnv()) return;
  const key = typeof exitName === "string" && exitName.length > 0 ? exitName : "<anonymous>";
  if (NOOP_EXIT_WARNED.has(key)) return;
  NOOP_EXIT_WARNED.add(key);
  console.warn(
    `[@modular-vue/compositions] A panel mounted into a composition zone called \`exit(${JSON.stringify(key)}, …)\`. ` +
      `Composition panels don't have an exit channel — the call has been dropped. ` +
      `Use \`useCompositionDispatch\` to mutate composition state, or \`useCompositionEmit\` for cross-zone hand-offs.`,
  );
}) as never;

/**
 * Test-only: clear the per-process latch that suppresses repeated NOOP_EXIT
 * warnings. Call from `beforeEach` if a test relies on observing the dev-warn
 * for an exit name that an earlier test may have already exhausted. Not exported
 * from the package entry; consumers should never need this.
 */
export function __resetNoopExitWarned(): void {
  NOOP_EXIT_WARNED.clear();
}

/**
 * Bridge a composition instance snapshot into a `shallowRef`, updated on every
 * runtime event and torn down on scope dispose. The Vue analog of the React
 * `useInstanceSnapshot` (`useSyncExternalStore`). The `runtime.subscribe`
 * listener also counts toward the record's disposal gate, so an outlet holding
 * this ref keeps its instance alive until unmount — matching the React effect's
 * subscribe/attach pairing.
 */
function subscribeInstanceSnapshot(
  runtime: CompositionRuntime,
  instanceId: CompositionInstanceId,
): ShallowRef<CompositionInstance | null> {
  const snapshot = shallowRef<CompositionInstance | null>(runtime.getInstance(instanceId));
  const unsubscribe = runtime.subscribe(instanceId, () => {
    snapshot.value = runtime.getInstance(instanceId);
  });
  onScopeDispose(unsubscribe);
  return snapshot;
}

/**
 * Renders a composition instance. Host-agnostic — works in a route Component, a
 * tab, a modal, or any plain container. On unmount while the instance has no
 * other listeners, the instance is disposed (deferred by a microtask inside the
 * runtime's `__detach` gate so a same-tick handoff to a sibling outlet does not
 * tear it down).
 *
 * The Vue analog of the React `<CompositionOutlet>`. Authored with
 * `defineComponent` + a render function (no SFC compiler in the package build;
 * see decision D4). The React render-prop `children(zones)` becomes a scoped
 * default slot: the host reads `{ [zoneName]: VNode }` and owns layout; the
 * framework owns each zone's content. Error-message prefixes are
 * `[@modular-vue/compositions]`.
 */
export const CompositionOutlet = defineComponent({
  name: "CompositionOutlet",
  props: {
    /**
     * Runtime to drive the outlet against. Optional when a
     * `<CompositionsProvider>` is mounted above — the outlet reads the runtime
     * from context in that case.
     */
    runtime: { type: Object as PropType<CompositionRuntime>, default: undefined },
    /** Composition id (for handle-driven mounts use `runtime.start(handle, input)` first). */
    compositionId: { type: String, required: true },
    instanceId: { type: String as PropType<CompositionInstanceId>, required: true },
    /**
     * Module descriptors the outlet resolves panels against. Optional — when
     * omitted, falls back to the descriptors the runtime was constructed with.
     */
    modules: {
      type: Object as PropType<Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>>,
      default: undefined,
    },
    /**
     * Fallback rendered inside each zone's `Suspense` boundary while a lazy
     * entry's chunk loads. Per-entry `fallback` overrides this.
     */
    loadingFallback: {
      type: null as unknown as PropType<VNode | (() => VNode)>,
      default: undefined,
    },
    notFoundComponent: { type: Object as PropType<Component>, default: undefined },
    errorComponent: { type: Object as PropType<Component>, default: undefined },
    /**
     * Routed to from `useCompositionEmit()` calls in any zone's panel. Use for
     * cross-zone hand-offs that don't fit through shared state.
     */
    onZoneEvent: {
      type: Function as PropType<(event: CompositionZoneEvent, ctx: { zone: string }) => void>,
      default: undefined,
    },
    /** Cap on `retry` responses from `onZoneError` before the zone falls back. Default: 2. */
    retryLimit: { type: Number, default: DEFAULT_RETRY_CAP },
  },
  setup(props, { slots }) {
    const context = inject(compositionsKey, null);
    // Unwrap the reactive prop proxy before touching runtime internals: Vue
    // deeply proxies prop objects, and `getInternals` keys its store on the raw
    // runtime identity produced by `createCompositionRuntime`. A proxied runtime
    // would miss that store. `context?.runtime` is provided un-proxied by the
    // provider, but `toRaw` on it is a harmless no-op.
    const runtime = toRaw(props.runtime ?? context?.runtime ?? undefined) ?? null;
    if (!runtime) {
      throw new Error(
        "[@modular-vue/compositions] <CompositionOutlet> needs a runtime. Either pass `runtime` or mount a <CompositionsProvider>.",
      );
    }
    const internals = getInternals(runtime);

    // Cycle guard. Two checks:
    //   1. Same instance id already in the ancestry → trivial cycle (a panel
    //      rendering an outlet for the same id it's hosted inside). Hard fail,
    //      render the error fallback.
    //   2. Same composition id appearing more times than the depth cap →
    //      cross-instance cycle, typically a journey that re-opens the
    //      composition under a fresh instance id every hop. The hops use
    //      different ids so the instance check misses them, but the definition
    //      depth grows without bound until the stack does. Hard fail at the cap.
    const ancestry = inject(compositionAncestryKey, null);
    const instanceId = props.instanceId;
    const compositionId = props.compositionId;
    const cycleDetected = ancestry?.instances.has(instanceId) ?? false;
    const currentDefinitionDepth = ancestry?.definitionDepth.get(compositionId) ?? 0;
    const definitionCycleDetected =
      !cycleDetected && currentDefinitionDepth >= DEFAULT_DEFINITION_DEPTH_CAP;

    // Extend and re-provide the ancestry for descendant outlets. Provided once
    // at setup (instanceId / compositionId are fixed for the mount), the Vue
    // analog of the React `<CompositionAncestryContext.Provider>` wrap.
    const instancesSet = new Set(ancestry?.instances ?? []);
    instancesSet.add(instanceId);
    const definitionDepthMap = new Map(ancestry?.definitionDepth ?? []);
    definitionDepthMap.set(compositionId, (definitionDepthMap.get(compositionId) ?? 0) + 1);
    provide(compositionAncestryKey, {
      instances: instancesSet,
      definitionDepth: definitionDepthMap,
    });

    const instance = subscribeInstanceSnapshot(runtime, instanceId);
    const getModules = (): Readonly<Record<string, ModuleDescriptor<any, any, any, any>>> =>
      toRaw(props.modules ?? internals.__moduleMap);

    // Attach / detach: increments outletRefCount; the runtime disposes the
    // instance when it drops to 0 with no listeners. Deferred via microtask
    // inside `__detach`. Skipped when a cycle was detected (no real mount).
    onMounted(() => {
      if (cycleDetected) return;
      internals.__attach(instanceId);
    });
    onUnmounted(() => {
      if (cycleDetected) return;
      internals.__detach(instanceId);
    });

    const reg = internals.__getRegistered(compositionId);
    const zoneNames = computed<readonly string[]>(() =>
      reg ? Object.keys(reg.definition.zones) : [],
    );

    // Eager preload: when a zone declares `preload: "eager"`, warm the chunk of
    // whatever module-entry its selector returns during idle time. Skip the prep
    // entirely when no zone is eager (the common case) so noisy state changes
    // don't churn idle callbacks.
    const eagerZoneNames = computed<readonly string[]>(() => {
      if (!reg) return [];
      const zones = reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>;
      const names: string[] = [];
      for (const zoneName of zoneNames.value) {
        if (zones[zoneName]?.preload === "eager") names.push(zoneName);
      }
      return names;
    });

    onMounted(() => {
      if (eagerZoneNames.value.length === 0) return;
      watch(
        // Re-key on a signature that flips only when an eager zone's resolution
        // changes; an unrelated state bump produces the same signature and the
        // watcher short-circuits.
        () => {
          const inst = instance.value;
          if (!reg || !inst || inst.status !== "active") return "";
          const zones = reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>;
          const modules = getModules();
          const parts: string[] = [];
          for (const zoneName of eagerZoneNames.value) {
            const descriptor = zones[zoneName];
            if (!descriptor) continue;
            let selection: CompositionZoneResolution<any>;
            try {
              selection = descriptor.select({
                state: inst.state,
                deps: internals.__deps,
                dispatch: noopDispatch,
                stores: noopStores,
              });
            } catch {
              parts.push(`${zoneName}:err`);
              continue;
            }
            parts.push(`${zoneName}:${computeSelectionKey(selection, null, modules)}`);
          }
          return parts.join("|");
        },
        (signature, _old, onCleanup) => {
          if (signature === "") return;
          const inst = instance.value;
          if (!reg || !inst || inst.status !== "active") return;
          const zones = reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>;
          const modules = getModules();

          let cancelled = false;
          const run = (): void => {
            if (cancelled) return;
            for (const zoneName of eagerZoneNames.value) {
              const descriptor = zones[zoneName];
              if (!descriptor) continue;
              let selection: CompositionZoneResolution<any>;
              try {
                selection = descriptor.select({
                  state: inst.state,
                  deps: internals.__deps,
                  dispatch: noopDispatch,
                  stores: noopStores,
                });
              } catch {
                // Selector errors surface at render time; preload is best-effort.
                continue;
              }
              if (selection.kind !== "module-entry") continue;
              const mod = modules[selection.module];
              const entry = mod?.entryPoints?.[selection.entry];
              if (!mod || !entry) continue;
              try {
                void resolveEntryComponent(entry)
                  .preload()
                  .catch(() => {});
              } catch {
                // Best-effort: a malformed entry would have failed validation
                // upstream. Don't let one bad zone block the rest.
              }
            }
          };

          const ricFn = (
            globalThis as {
              requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
            }
          ).requestIdleCallback;
          const cicFn = (globalThis as { cancelIdleCallback?: (handle: number) => void })
            .cancelIdleCallback;
          let idleHandle: number | undefined;
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          if (typeof ricFn === "function") {
            idleHandle = ricFn(run, { timeout: 2000 });
          } else {
            timeoutHandle = setTimeout(run, 0);
          }
          onCleanup(() => {
            cancelled = true;
            if (idleHandle !== undefined && typeof cicFn === "function") cicFn(idleHandle);
            if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
          });
        },
        { immediate: true },
      );
    });

    return () => {
      if (cycleDetected) {
        return renderError(
          "<all>",
          new Error(
            `[@modular-vue/compositions] Composition instance "${instanceId}" is already in the render ancestry — refusing to mount it as a descendant. ` +
              `This is usually caused by a zone hosting a journey whose step renders the same composition instance.`,
          ),
          props.errorComponent,
        );
      }
      if (definitionCycleDetected) {
        return renderError(
          "<all>",
          new Error(
            `[@modular-vue/compositions] Composition "${compositionId}" has nested inside itself ${DEFAULT_DEFINITION_DEPTH_CAP} times — refusing to recurse further. ` +
              `This usually means a zone is hosting a journey whose step re-opens the same composition under a fresh instance id each hop. ` +
              `Restructure to share a single composition instance (the same-instance guard will then catch the recursion) or break the loop in the journey definition.`,
          ),
          props.errorComponent,
        );
      }

      const inst = instance.value;
      if (!inst) return null;
      if (inst.status === "disposed") return null;

      if (!reg) {
        return h(DefaultNotFound, {
          zone: "<all>",
          moduleId: compositionId,
          entry: "(unknown composition)",
        });
      }

      const modules = getModules();
      // Build the zone map: each entry is a fully-wrapped renderable VNode.
      const zoneElements: Record<string, VNode> = {};
      for (const zoneName of zoneNames.value) {
        const descriptor = (
          reg.definition.zones as Record<string, CompositionZoneDescriptor<any, any>>
        )[zoneName];
        zoneElements[zoneName] = h(ZoneRenderer, {
          key: zoneName,
          runtime,
          compositionId,
          instanceId,
          zone: zoneName,
          descriptor,
          modules,
          loadingFallback: props.loadingFallback,
          notFoundComponent: props.notFoundComponent,
          errorComponent: props.errorComponent,
          onZoneEvent: props.onZoneEvent,
          retryLimit: props.retryLimit,
        });
      }

      return slots.default?.(zoneElements) ?? null;
    };
  },
});

const ZoneRenderer = defineComponent({
  name: "CompositionZoneRenderer",
  props: {
    runtime: { type: Object as PropType<CompositionRuntime>, required: true },
    compositionId: { type: String, required: true },
    instanceId: { type: String as PropType<CompositionInstanceId>, required: true },
    zone: { type: String, required: true },
    descriptor: {
      type: Object as PropType<CompositionZoneDescriptor<any, any>>,
      required: true,
    },
    modules: {
      type: Object as PropType<Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>>,
      required: true,
    },
    loadingFallback: {
      type: null as unknown as PropType<VNode | (() => VNode)>,
      default: undefined,
    },
    notFoundComponent: { type: Object as PropType<Component>, default: undefined },
    errorComponent: { type: Object as PropType<Component>, default: undefined },
    onZoneEvent: {
      type: Function as PropType<(event: CompositionZoneEvent, ctx: { zone: string }) => void>,
      default: undefined,
    },
    retryLimit: { type: Number, required: true },
  },
  setup(props) {
    // Unwrap the reactive prop proxies: `getInternals` keys its store on the raw
    // runtime, and `resolveEntryComponent`'s per-entry `WeakMap` cache keys on
    // the raw entry object identity (so a preloaded chunk is reused by the
    // render). `internals.__moduleMap` is already raw; `toRaw` is a no-op there.
    const runtime = toRaw(props.runtime);
    const internals = getInternals(runtime);
    const zone = props.zone;
    const instanceId = props.instanceId;
    const compositionId = props.compositionId;
    const descriptor = toRaw(props.descriptor);
    const getModules = (): Readonly<Record<string, ModuleDescriptor<any, any, any, any>>> =>
      toRaw(props.modules);

    const retryKey = ref(0);
    // Sentinel that holds the selectionKey whose error should render `null`
    // (policy === "ignore"). Scoped per resolution so a later resolution that
    // errors gets its own decision.
    const ignoredSelectionKey = ref<string | null>(null);

    // Subscribe to the composition's store so the zone re-runs its selector on
    // every state change. The store lives on the instance record. A unique
    // `STATE_UNAVAILABLE` sentinel distinguishes "record disappeared
    // mid-disposal" from a composition whose state is legitimately falsy.
    //
    // The record/store handle is captured once at setup and never re-read.
    // That is safe because `instanceId` is fixed for the mount and ids are
    // minted per `start`, so the record backing this zone cannot be swapped out
    // from under us for the lifetime of the component.
    const record = internals.__getRecord(instanceId);
    const store = record?.store;
    const state = shallowRef<unknown>(store ? store.getState() : STATE_UNAVAILABLE);
    if (store) {
      const unsubscribe = store.subscribe(() => {
        state.value = store.getState();
      });
      onScopeDispose(unsubscribe);
    }

    // Stable callbacks + stores + context value, captured once at setup (the
    // React binding memoizes these on `[runtime, instanceId]`, which are fixed
    // for the mount). Foreign panels reading `useCompositionDispatch` /
    // `useCompositionEmit` therefore never churn on composition-state changes,
    // and `useCompositionState` (via the context store) never re-subscribes.
    const dispatch = (updater: unknown): void => {
      runtime.dispatch(instanceId, updater as never);
    };
    const stores = createCompositionZoneStores<unknown>(runtime, instanceId);
    const emit = (event: CompositionZoneEvent): void => {
      try {
        props.onZoneEvent?.(event, { zone });
      } catch (err) {
        internals.__fireOnError(instanceId, err, { zone, phase: "emit" });
      }
    };
    const contextValue: CompositionContextValue = {
      runtime,
      compositionId,
      instanceId,
      zone,
      // Cast: the context type erases TState to unknown so the same context can
      // carry stores of different shapes. Panels narrow via their selector.
      store: store as unknown as CompositionContextValue["store"],
      dispatch: dispatch as CompositionContextValue["dispatch"],
      emit,
    };
    provide(compositionInstanceKey, contextValue);

    // Journey-zone instance cache — mirrors the React `journeyInstanceCache` /
    // `journeyEndQueue` refs. The cache holds the *current* resolution's minted
    // journey instance id keyed on `(handle.id, hash(input))`; when the
    // resolution rolls over the previous id is queued and drained (via
    // `adapter.end`) after the render commits, so a long-running composition
    // cycling through inputs doesn't accumulate orphan journey instances. `end`
    // is destructive, so it never runs during render.
    let journeyInstanceCache: { key: string; id: CompositionInstanceId } | null = null;
    const journeyEndQueue: CompositionInstanceId[] = [];

    onUpdated(() => {
      if (journeyEndQueue.length === 0) return;
      const endFn = runtime.getMountAdapter("journey")?.end;
      if (endFn) {
        for (const id of journeyEndQueue) endFn(id);
      }
      journeyEndQueue.length = 0;
    });
    onUnmounted(() => {
      const endFn = runtime.getMountAdapter("journey")?.end;
      if (endFn) {
        for (const id of journeyEndQueue) endFn(id);
        if (journeyInstanceCache) endFn(journeyInstanceCache.id);
      }
      journeyEndQueue.length = 0;
      journeyInstanceCache = null;
    });

    // Derive the resolution + a deterministic selection key from the current
    // state. Memoized on `state` so unrelated reactivity doesn't re-run the
    // selector; the selector may throw, which is captured (not thrown).
    const resolution = computed<{
      selection: CompositionZoneResolution<any>;
      selectorError: unknown;
      selectionKey: string;
    }>(() => {
      let selection: CompositionZoneResolution<any> = { kind: "empty" };
      let selectorError: unknown = null;
      const currentState = state.value;
      if (record && store && currentState !== STATE_UNAVAILABLE) {
        try {
          selection = descriptor.select({
            state: currentState,
            deps: internals.__deps,
            dispatch,
            stores,
          });
        } catch (err) {
          selectorError = err;
        }
      }
      const selectionKey = computeSelectionKey(selection, selectorError, getModules());
      return { selection, selectorError, selectionKey };
    });

    // When the resolution changes, reset both the per-zone retry counter and any
    // sticky `"ignore"` decision the previous resolution set. Without resetting,
    // a panel that failed once under the ignore policy would keep rendering
    // `null` if its selectionKey ever recurred after a detour.
    watch(
      () => resolution.value.selectionKey,
      (selectionKey, prev) => {
        if (prev !== undefined && prev !== selectionKey) {
          internals.__resetRetry(instanceId, zone);
          if (ignoredSelectionKey.value !== null && ignoredSelectionKey.value !== selectionKey) {
            ignoredSelectionKey.value = null;
          }
        }
      },
    );

    const handleError = (err: unknown): void => {
      const selectionKey = resolution.value.selectionKey;
      internals.__fireOnError(instanceId, err, { zone, phase: "render" });
      const currentReg = internals.__getRegistered(compositionId);
      const currentState = state.value;
      const policy =
        currentReg?.definition.onZoneError?.(err, {
          zone,
          instanceId,
          state: currentState === STATE_UNAVAILABLE ? undefined : currentState,
        }) ?? "fallback";
      if (policy === "retry") {
        if (internals.__consumeRetry(instanceId, zone, props.retryLimit)) {
          retryKey.value += 1;
          return;
        }
        // Budget exhausted — surface a distinct phase so shell telemetry can
        // split "retried successfully" from "host asked for retries but ran
        // out". The boundary's fallback UI still renders.
        internals.__fireOnError(instanceId, err, { zone, phase: "retry-exhausted" });
        return;
      }
      if (policy === "ignore") {
        // Record the selectionKey that should render null. Once the selector
        // returns a different resolution, the new selectionKey mismatches the
        // ignored one and the boundary renders normally.
        ignoredSelectionKey.value = selectionKey;
        return;
      }
      // "fallback" — keep the default error UI rendered.
    };

    return () => {
      if (!record || !store) return null;

      const { selection, selectorError, selectionKey } = resolution.value;

      if (selectorError) {
        internals.__fireOnError(instanceId, selectorError, { zone, phase: "select" });
        return renderError(zone, selectorError, props.errorComponent);
      }

      const modules = getModules();
      const loadingFallback = props.loadingFallback;

      // Build the renderable content for this resolution.
      let content: VNode | null = null;

      if (selection.kind === "empty") {
        const Fallback = descriptor.fallback;
        content = Fallback ? h(Fallback as Component) : null;
      } else if (selection.kind === "module-entry") {
        const mod = modules[selection.module];
        const entry = mod?.entryPoints?.[selection.entry];
        if (!mod || !entry) {
          const NotFound = props.notFoundComponent ?? DefaultNotFound;
          content = h(NotFound, { zone, moduleId: selection.module, entry: selection.entry });
        } else if (!entryAllowsCompositionMount(entry)) {
          // Type-level enforcement via `CompositionZoneSpec`'s mountKinds filter
          // usually catches this. The render-time check is the belt-and-braces
          // against type-bypass paths: a journey-only entry mounted into a
          // composition would silently drop `exit` calls without it.
          content = renderError(
            zone,
            new Error(
              `[@modular-vue/compositions] Entry "${selection.module}.${selection.entry}" declares ` +
                `mountKinds=${JSON.stringify(entry.mountKinds)} which does not include "composition". ` +
                `Composition zones cannot mount journey-only entries — either widen the entry's mountKinds, ` +
                `or pick a different module-entry in the selector.`,
            ),
            props.errorComponent,
          );
        } else {
          const { Component: PanelComponent } = resolveEntryComponent(entry);
          const entryFallback = (entry as { fallback?: VNode | (() => VNode) }).fallback;
          content = h(Suspense, null, {
            default: () =>
              h(PanelComponent as Component, {
                input: selection.input,
                // Composition panels don't have direct exit/goBack/goForward
                // hooks — they communicate via dispatch + emit.
                exit: NOOP_EXIT,
              }),
            fallback: () => renderFallback(entryFallback ?? loadingFallback),
          });
        }
      } else if (selection.kind === "journey") {
        // Look up the registered "journey" mount adapter and mint (or reuse a
        // cached) instance for the resolution's handle+input. The adapter
        // abstracts away the journey runtime — compositions stays decoupled from
        // `@modular-vue/journeys` entirely.
        const adapter = runtime.getMountAdapter("journey");
        if (!adapter) {
          content = renderError(
            zone,
            new Error(
              '[@modular-vue/compositions] Zone returned a `journey` resolution but no mount adapter is registered for kind "journey". ' +
                'Call `runtime.registerMountAdapter("journey", createJourneyMountAdapter(journeyRuntime))` before mounting the composition.',
            ),
            props.errorComponent,
          );
        } else {
          let journeyInstanceId = selection.instanceId;
          if (!journeyInstanceId) {
            const cacheKey = `${selection.handle.id}:${hashInput(selection.input)}`;
            const cached = journeyInstanceCache;
            if (cached && cached.key === cacheKey) {
              journeyInstanceId = cached.id;
            } else {
              // Roll over: queue the previously-cached id for end-after-commit
              // (the destructive side effect must not run during render). The
              // mint stays in render — it's idempotent per render via the cache.
              if (cached) journeyEndQueue.push(cached.id);
              try {
                journeyInstanceId = adapter.start(selection.handle.id, selection.input);
              } catch (err) {
                // `adapter.start` is foreign runtime code called during render,
                // so a throw here escapes the per-zone `ZoneErrorBoundary` (which
                // only catches *descendant* errors) and would tear down the whole
                // outlet. Contain it to this zone: report through the same channel
                // as a selector error and render the fallback in place.
                internals.__fireOnError(instanceId, err, { zone, phase: "render" });
                return renderError(zone, err, props.errorComponent);
              }
              journeyInstanceCache = { key: cacheKey, id: journeyInstanceId };
            }
          }
          const AdapterOutlet = adapter.Outlet as Component;
          content = h(AdapterOutlet, { instanceId: journeyInstanceId, loadingFallback });
        }
      }

      // Per-zone error boundary. Keyed by selectionKey + retryKey so a selector
      // change or a retry cleanly remounts a fresh boundary.
      const boundaryKey = `${selectionKey}:${retryKey.value}`;

      return h(
        ZoneErrorBoundary,
        {
          key: boundaryKey,
          zone,
          onError: handleError,
          errorComponent: props.errorComponent,
          renderNullOnError: ignoredSelectionKey.value === selectionKey,
        },
        () => content,
      );
    };
  },
});

function renderError(zone: string, error: unknown, errorComponent?: Component): VNode {
  const Fallback = errorComponent ?? DefaultError;
  return h(Fallback, { zone, error });
}

const DefaultNotFound = defineComponent({
  name: "CompositionOutletNotFound",
  props: {
    zone: { type: String, required: true },
    moduleId: { type: String, required: true },
    entry: { type: String, required: true },
  },
  setup(props) {
    return () =>
      h(
        "div",
        { style: { padding: "1rem", color: "#c53030" }, role: "alert" },
        `Composition zone "${props.zone}": no entry "${props.moduleId}.${props.entry}" on the registered modules.`,
      );
  },
});

const DefaultError = defineComponent({
  name: "CompositionOutletError",
  props: {
    zone: { type: String, required: true },
    error: { type: null as unknown as PropType<unknown>, default: undefined },
  },
  setup(props) {
    return () => {
      const err: unknown = props.error;
      const message = err instanceof Error ? err.message : String(err);
      return h(
        "div",
        {
          style: {
            padding: "1rem",
            border: "1px solid #e53e3e",
            borderRadius: "0.5rem",
            margin: "0.25rem",
          },
          role: "alert",
          "data-composition-zone-error": props.zone,
        },
        [
          h(
            "h4",
            { style: { color: "#e53e3e", margin: "0 0 0.5rem 0" } },
            `Zone "${props.zone}" encountered an error`,
          ),
          h(
            "pre",
            { style: { fontSize: "0.875rem", color: "#718096", whiteSpace: "pre-wrap" } },
            message,
          ),
        ],
      );
    };
  },
});

/**
 * Internal boundary the zone renderer wraps each resolution in. Analog of the
 * React class `ZoneErrorBoundary`: `onErrorCaptured` plays the role of
 * `getDerivedStateFromError` + `componentDidCatch`, flipping a local `error` ref
 * that swaps the subtree for the fallback and forwarding the error to `onError`
 * (which runs the zone's retry/ignore/fallback policy). Returning `false` stops
 * propagation to ancestor boundaries.
 *
 * When the parent decides the current resolution's error should render `null`
 * (policy `"ignore"`), it sets `renderNullOnError`: the boundary still catches
 * and reports, but the visible output is suppressed. The renderer keys this
 * boundary by `${selectionKey}:${retryKey}`, so a selector change or a retry
 * remounts a fresh boundary — the Vue analog of the React `key`-driven reset.
 */
const ZoneErrorBoundary = defineComponent({
  name: "CompositionZoneErrorBoundary",
  props: {
    zone: { type: String, required: true },
    onError: { type: Function as PropType<(err: unknown) => void>, required: true },
    errorComponent: { type: Object as PropType<Component>, default: undefined },
    renderNullOnError: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const error = ref<unknown>(null);
    onErrorCaptured((err) => {
      error.value = err;
      props.onError(err);
      // Handled — don't propagate to ancestor boundaries.
      return false;
    });
    return () => {
      if (error.value != null) {
        if (props.renderNullOnError) return null;
        const Fallback = props.errorComponent ?? DefaultError;
        return h(Fallback, { zone: props.zone, error: error.value });
      }
      return slots.default?.();
    };
  },
});
