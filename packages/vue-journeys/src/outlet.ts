import {
  computed,
  defineComponent,
  h,
  inject,
  onErrorCaptured,
  onMounted,
  onUnmounted,
  ref,
  Suspense,
  toRaw,
  watch,
  type Component,
  type PropType,
  type ShallowRef,
  type VNode,
} from "vue";
import type { ModuleDescriptor, ModuleEntryPoint } from "@modular-frontend/core";
import { resolveEntryComponent } from "@modular-vue/vue";

import { getInternals, isAnnotatedTransition } from "@modular-frontend/journeys-engine";
import { journeyKey } from "./provider.js";
import { useCallChain, useInstanceSnapshot, useLeafId } from "./instance-hooks.js";
import type {
  AnyJourneyDefinition,
  InstanceId,
  JourneyRuntime,
  JourneyStep,
  TerminalOutcome,
} from "@modular-frontend/journeys-engine";

export type JourneyStepErrorPolicy = "abort" | "retry" | "ignore";

/** Maximum automatic retries before falling back to `abort`. */
const DEFAULT_RETRY_CAP = 2;

export interface JourneyOutletNotFoundProps {
  readonly moduleId: string;
  readonly entry: string;
}

export interface JourneyOutletErrorProps {
  readonly moduleId: string;
  readonly error: unknown;
}

/**
 * Renders the current step of a journey instance. Host-agnostic — works in a
 * tab, modal, route element, or plain `<div>`. On unmount while active, the
 * instance is abandoned (deferred by a microtask so a same-tick handoff to a
 * sibling outlet — outlet A unmounts, outlet B mounts against the same instance
 * — does not tear the instance down: the deferred check consults the record's
 * listener count and skips `end()` when another outlet is still subscribed).
 *
 * The Vue analog of the React `<JourneyOutlet>`. Authored with `defineComponent`
 * + a render function (no SFC compiler in the package build; see decision D4).
 * The instance snapshots come from the reactive `useInstanceSnapshot` /
 * `useLeafId` composables (PR-30), so the outlet re-renders as the active call
 * chain shifts (parent invokes a child, child terminates) and as the leaf's own
 * step advances. Error-message prefixes are `[@modular-vue/journeys]`.
 */
export const JourneyOutlet = defineComponent({
  name: "JourneyOutlet",
  props: {
    /**
     * Runtime to drive the outlet against. Optional when a `<JourneyProvider>`
     * is mounted above — the outlet reads the runtime from context in that
     * case. Explicit prop overrides context, so one outlet can reach a
     * different runtime when needed.
     */
    runtime: { type: Object as PropType<JourneyRuntime>, default: undefined },
    instanceId: { type: String as PropType<InstanceId>, required: true },
    /**
     * Module descriptors the outlet resolves step components against. Optional —
     * when omitted, the outlet pulls the descriptors the runtime was constructed
     * with (the common case).
     */
    modules: {
      type: Object as PropType<Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>>,
      default: undefined,
    },
    /** Rendered while the instance is in `loading` status. */
    loadingFallback: {
      type: null as unknown as PropType<VNode | (() => VNode)>,
      default: undefined,
    },
    onFinished: {
      type: Function as PropType<(outcome: TerminalOutcome) => void>,
      default: undefined,
    },
    onStepError: {
      type: Function as PropType<
        (err: unknown, ctx: { step: JourneyStep }) => JourneyStepErrorPolicy
      >,
      default: undefined,
    },
    /**
     * When `false`, the outlet renders the instance you handed it directly, even
     * if it has a child journey in flight. Set this when you compose two outlets
     * to render parent and child side-by-side. When `true` (the default), the
     * outlet walks the active call chain down to the leaf and renders the leaf.
     */
    leafOnly: { type: Boolean, default: true },
    /**
     * Cap on `retry` responses before the outlet falls back to `abort`. The
     * counter increments on every retry and is never reset. Default: 2.
     */
    retryLimit: { type: Number, default: DEFAULT_RETRY_CAP },
    /**
     * Rendered when the current step points at a module/entry that is not
     * registered with the runtime. Defaults to a plain red notice.
     */
    notFoundComponent: {
      type: Object as PropType<Component>,
      default: undefined,
    },
    /**
     * Rendered when a step component throws. Defaults to a plain red notice with
     * the error message. Receives the raw error so shells can route it through
     * their own reporting.
     */
    errorComponent: { type: Object as PropType<Component>, default: undefined },
    /**
     * Speculatively prefetch the chunks for entries reachable from the current
     * step during idle time after mount. `"precise"` (default, alias `true`)
     * reads declared `targets` from annotated handlers; `"aggressive"` preloads
     * every entry referenced as a transition source or annotated target;
     * `false` opts out. No effect for eager entries; SSR is a no-op.
     */
    preload: {
      type: [Boolean, String] as PropType<boolean | "precise" | "aggressive">,
      default: "precise",
    },
  },
  setup(props) {
    const context = inject(journeyKey, null);
    // Unwrap the reactive prop proxy before touching runtime internals: Vue
    // deeply proxies prop objects, and `getInternals` keys its store on the raw
    // runtime identity produced by `createJourneyRuntime`. A proxied runtime
    // would miss that store. `context?.runtime` can also be proxied (the
    // provider stashes its own `runtime` prop), so unwrap both.
    const runtime = toRaw(props.runtime ?? context?.runtime ?? undefined) ?? null;
    if (!runtime) {
      throw new Error(
        "[@modular-vue/journeys] <JourneyOutlet> needs a runtime. Either pass `runtime` or mount a <JourneyProvider>.",
      );
    }
    const internals = getInternals(runtime);

    // Unwrap the reactive prop proxy: Vue deeply proxies prop objects, which
    // would change the entry-object identity that keys `resolveEntryComponent`'s
    // per-entry `WeakMap` cache — so a preloaded chunk (resolved off the raw
    // runtime map) would not be reused by the render, and the memoized async
    // wrapper would churn. `internals.__moduleMap` is already raw; `toRaw` is a
    // no-op there.
    const getModules = (): Readonly<Record<string, ModuleDescriptor<any, any, any, any>>> =>
      toRaw(props.modules ?? internals.__moduleMap);

    // Subscribe to the originally-supplied (root) instance so onFinished and
    // abandon-on-unmount resolve against THAT instance — even when leaf-walk is
    // rendering a different (child/grandchild) record. The leaf is also
    // subscribed-to via `useLeafId` so this component re-renders when the call
    // chain shifts (parent invokes a child, child terminates, etc.).
    const rootInstance = useInstanceSnapshot(runtime, () => props.instanceId);
    const leafId = useLeafId(
      runtime,
      () => props.instanceId,
      () => props.leafOnly,
    );
    // Subscribe to the leaf separately so leaf-internal transitions trigger
    // re-renders. When the leaf id equals the root, useInstanceSnapshot dedupes
    // naturally (same subscribe call to the same record).
    const leafInstance = useInstanceSnapshot(runtime, leafId);
    const instance = computed(() =>
      leafId.value === props.instanceId ? rootInstance.value : leafInstance.value,
    );

    const retryKey = ref(0);

    // Abandon on unmount while still active or still loading. Deferred one
    // microtask so a same-tick handoff to a sibling outlet keeps the instance
    // alive: if any subscriber is still attached to the record, another outlet
    // has taken over and we skip the `end()`. Targets the ROOT — `runtime.end`
    // cascades to any active child, so a single call cleans the whole chain.
    //
    // Read `props.instanceId` at unmount time (not a value captured at setup)
    // so a host that re-binds `instanceId` on a live outlet abandons the
    // instance it is currently rendering — matching the React effect, whose
    // cleanup closure holds the latest id after re-subscription.
    onUnmounted(() => {
      const instanceId = props.instanceId;
      queueMicrotask(() => {
        const record = internals.__getRecord(instanceId);
        if (!record) return;
        if (record.status !== "active" && record.status !== "loading") return;
        if (record.listeners.size > 0) return;
        // `force`: an unmounting outlet cannot host an `onAbandon` `{ next }`
        // (there is nothing left to render it), so guarantee the instance ends
        // rather than advancing to an orphaned live step. Matches the React
        // outlet.
        runtime.end(instanceId, { reason: "unmounted" }, { force: true });
      });
    });

    // Fire onFinished exactly once on terminal — bound to the ROOT, since the
    // caller asked to be notified when the journey they mounted finishes. Child
    // terminations are observed via the parent's resume handler and are not
    // reported through this hook.
    const finishedInstances = new Set<InstanceId>();
    watch(
      rootInstance,
      (root) => {
        if (!root) return;
        if (root.status !== "completed" && root.status !== "aborted") return;
        if (finishedInstances.has(root.id)) return;
        finishedInstances.add(root.id);
        props.onFinished?.({
          status: root.status,
          payload: root.terminalPayload,
          instanceId: root.id,
          journeyId: root.journeyId,
        });
      },
      { immediate: true },
    );

    // Speculative preload of reachable entries' chunks. Re-keyed on
    // (status, module, entry, journey) — not on the whole snapshot, which
    // changes reference on every bump (timestamps, child-id shifts). Only fires
    // after mount (browser), matching the React effect; SSR stays a no-op.
    onMounted(() => {
      watch(
        () => {
          const inst = instance.value;
          return [
            props.preload,
            inst?.status === "active",
            inst?.step?.moduleId,
            inst?.step?.entry,
            inst?.journeyId,
          ] as const;
        },
        ([preload, isActive, stepModuleId, stepEntryName, journeyId], _old, onCleanup) => {
          if (preload === false || !isActive) return;
          if (!stepModuleId || !stepEntryName || !journeyId) return;
          const reg = internals.__getRegistered(journeyId);
          if (!reg) return;
          const mode = preload === "aggressive" ? "aggressive" : "precise";
          const targets = collectPreloadTargets(
            reg.definition,
            getModules(),
            stepModuleId,
            stepEntryName,
            mode,
          );
          if (targets.length === 0) return;

          let cancelled = false;
          const run = (): void => {
            if (cancelled) return;
            for (const entry of targets) {
              try {
                // `.catch` swallows async rejection from the lazy import; the
                // surrounding try/catch only covers a synchronous throw from
                // `resolveEntryComponent`/`preload` itself. Both are best-effort:
                // a malformed entry would have failed validation upstream, so one
                // bad entry never hides the rest.
                void resolveEntryComponent(entry)
                  .preload()
                  .catch(() => {});
              } catch {
                // Synchronous failure — see above.
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
      const inst = instance.value;
      if (!inst) return null;
      if (inst.status === "loading") {
        const lf = props.loadingFallback;
        return (typeof lf === "function" ? lf() : lf) ?? null;
      }
      if (inst.status === "completed" || inst.status === "aborted") return null;

      const step = inst.step;
      if (!step) return null;

      const modules = getModules();
      const mod = modules[step.moduleId];
      const entry = mod?.entryPoints?.[step.entry];
      if (!mod || !entry) {
        const NotFound = props.notFoundComponent ?? DefaultNotFound;
        return h(NotFound, { moduleId: step.moduleId, entry: step.entry });
      }
      if (!entryAllowsJourneyMount(entry)) {
        // Type-level enforcement via `StepSpec`'s mountKinds filter catches this
        // for typed code. The runtime check is the belt-and-braces for
        // type-bypass paths: journey-only hosts must not mount entries declared
        // `mountKinds: ["composition"]`.
        const ErrorComp = props.errorComponent ?? DefaultError;
        return h(ErrorComp, {
          moduleId: step.moduleId,
          error: new Error(
            `[@modular-vue/journeys] Entry "${step.moduleId}.${step.entry}" declares ` +
              `mountKinds=${JSON.stringify(entry.mountKinds)} which does not include "journey". ` +
              `Journey steps cannot mount composition-only entries — either widen the entry's mountKinds, ` +
              `or pick a different module-entry in the transition.`,
          ),
        });
      }

      // Resolve the *leaf's* record and registration so the step callbacks
      // (`exit`, `goBack`) drive the leaf's transitions.
      const record = internals.__getRecord(inst.id);
      const reg = internals.__getRegistered(inst.journeyId);
      if (!record || !reg) return null;
      const { exit, goBack, goForward } = internals.__bindStepCallbacks(record, reg);

      const handleError = (err: unknown): void => {
        // Registration-level onError fires on every component throw. Route
        // through the runtime so `fireOnError` stays the single owner of hook
        // firing. Bound to the LEAF's instance id since the throw came from the
        // leaf step's component.
        internals.__fireComponentError(inst.id, err, step);
        let policy = props.onStepError?.(err, { step }) ?? "abort";
        if (policy === "retry") {
          if (!internals.__consumeRetry(inst.id, props.retryLimit)) {
            policy = "abort";
          }
        }
        if (policy === "abort") {
          // End the LEAF — its abort cascades via the parent's resume handler.
          runtime.end(inst.id, { reason: "component-error", error: err });
          return;
        }
        if (policy === "retry") {
          retryKey.value += 1;
        }
        // 'ignore' — leave the boundary UI in place until the user navigates away.
      };

      const { Component: StepComponent } = resolveEntryComponent(entry);
      const stepKey = `${record.stepToken}:${retryKey.value}`;
      const entryFallback = (entry as { fallback?: VNode | (() => VNode) }).fallback;
      const outletFallback = props.loadingFallback;

      return h(
        StepErrorBoundary,
        {
          key: stepKey,
          moduleId: step.moduleId,
          onError: handleError,
          errorComponent: props.errorComponent,
        },
        () =>
          h(Suspense, null, {
            default: () =>
              h(StepComponent as Component, {
                input: step.input,
                exit,
                goBack,
                goForward,
              }),
            fallback: () => {
              const fb = entryFallback ?? outletFallback;
              return (typeof fb === "function" ? fb() : fb) ?? null;
            },
          }),
      );
    };
  },
});

/**
 * Walk `definition.transitions` to assemble the set of entry-point descriptors
 * to preload. In `"precise"` mode we look at the current step's transitions only
 * and read each handler's declared `targets`; in `"aggressive"` mode we walk
 * every entry referenced anywhere in the map. Both skip the current step.
 */
function collectPreloadTargets(
  definition: AnyJourneyDefinition,
  modules: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>,
  currentModuleId: string,
  currentEntry: string,
  mode: "precise" | "aggressive",
): readonly ModuleEntryPoint<any>[] {
  const seen = new Set<string>();
  const out: ModuleEntryPoint<any>[] = [];
  const transitions = definition.transitions as
    | Record<string, Record<string, Record<string, unknown>> | undefined>
    | undefined;
  if (!transitions) return out;

  const collectPair = (moduleId: string, entryName: string): void => {
    if (!moduleId || !entryName) return;
    if (moduleId === currentModuleId && entryName === currentEntry) return;
    const seenKey = `${moduleId} ${entryName}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    const entry = modules[moduleId]?.entryPoints?.[entryName];
    if (entry) out.push(entry);
  };

  if (mode === "precise") {
    const perEntry = transitions[currentModuleId]?.[currentEntry];
    if (!perEntry) return out;
    for (const value of Object.values(perEntry)) {
      if (!isAnnotatedTransition(value)) continue;
      for (const target of value.targets) {
        // Sentinel targets (`"complete"` / `"abort"` / `"invoke"`) carry no
        // chunk to preload — skip them here.
        if (typeof target === "string") continue;
        collectPair(target.module, target.entry);
      }
    }
    return out;
  }

  // Aggressive — every (module, entry) the journey could plausibly navigate to:
  // source-side keys UNIONED with the destinations declared by every annotated
  // handler (covers terminal-only destination steps).
  for (const [moduleId, perModule] of Object.entries(transitions)) {
    if (!perModule) continue;
    for (const [entryName, perExit] of Object.entries(perModule)) {
      collectPair(moduleId, entryName);
      if (!perExit) continue;
      for (const value of Object.values(perExit)) {
        if (!isAnnotatedTransition(value)) continue;
        for (const target of value.targets) {
          if (typeof target === "string") continue;
          collectPair(target.module, target.entry);
        }
      }
    }
  }
  return out;
}

/**
 * Returns true iff the entry's `mountKinds` permits the `"journey"` host.
 * Omitted `mountKinds` defaults to "every mount surface", so existing modules
 * that never opted in still work. Mirrors the composition outlet's
 * `entryAllowsCompositionMount`.
 */
function entryAllowsJourneyMount(entry: { readonly mountKinds?: readonly string[] }): boolean {
  if (!Array.isArray(entry.mountKinds)) return true;
  return entry.mountKinds.includes("journey");
}

const DefaultNotFound = defineComponent({
  name: "JourneyOutletNotFound",
  props: {
    moduleId: { type: String, required: true },
    entry: { type: String, required: true },
  },
  setup(props) {
    return () =>
      h(
        "div",
        { style: { padding: "1rem", color: "#c53030" } },
        `Journey outlet: no entry "${props.moduleId}.${props.entry}" on the registered modules.`,
      );
  },
});

const DefaultError = defineComponent({
  name: "JourneyOutletError",
  props: {
    moduleId: { type: String, required: true },
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
            margin: "1rem",
          },
          role: "alert",
          "data-journey-step-error": props.moduleId,
        },
        [
          h(
            "h3",
            { style: { color: "#e53e3e", margin: "0 0 0.5rem 0" } },
            `Module "${props.moduleId}" encountered an error`,
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
 * Internal boundary the outlet wraps each step in. Analog of the React class
 * `StepErrorBoundary`: `onErrorCaptured` plays the role of
 * `getDerivedStateFromError` + `componentDidCatch`, flipping a local `error`
 * ref that swaps the subtree for the fallback and forwarding the error to
 * `onError` (which runs the outlet's retry/abort/ignore policy). Returning
 * `false` stops propagation to ancestor boundaries.
 *
 * The outlet keys this boundary by `${stepToken}:${retryKey}`, so a retry
 * (which bumps `retryKey`) remounts a fresh boundary that renders the step
 * again — the Vue analog of the React `key`-driven boundary reset.
 */
const StepErrorBoundary = defineComponent({
  name: "JourneyStepErrorBoundary",
  props: {
    moduleId: { type: String, required: true },
    onError: { type: Function as PropType<(err: unknown) => void>, required: true },
    errorComponent: { type: Object as PropType<Component>, default: undefined },
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
        const ErrorFallback = props.errorComponent ?? DefaultError;
        return h(ErrorFallback, { moduleId: props.moduleId, error: error.value });
      }
      return slots.default?.();
    };
  },
});

/**
 * Returns a reactive `ShallowRef` of the call stack for an outlet's instance —
 * root at index 0, the active leaf at the end, intermediate parents in between.
 * Useful for shells that render layered presentations (parent underneath, child
 * in a modal): mount the parent outlet with `leafOnly={false}` and the child
 * outlet against `chain.value[chain.value.length - 1]`. Returns a ref (not a
 * plain array) per the PR-30 reactive-source convention.
 */
export function useJourneyCallStack(
  runtime: JourneyRuntime,
  rootId: InstanceId,
): ShallowRef<readonly InstanceId[]> {
  return useCallChain(runtime, rootId, true);
}
