import { computed, toRaw, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { InstanceId, JourneyRuntime } from "@modular-frontend/journeys-engine";
import {
  resolveStepSequence,
  type JourneyDefinition,
  type ModuleTypeMap,
  type ResolvedJourneyStep,
  type ResolveStepSequenceOptions,
  type StepSequenceOptionsArg,
} from "@modular-frontend/journeys-engine";
import { useInstanceSnapshot } from "./instance-hooks.js";
import { useJourneyContext } from "./provider.js";

interface UseJourneyProgressBase {
  /**
   * Runtime the `instanceId` belongs to. Defaults to the one provided by a
   * surrounding `<JourneyProvider>`.
   */
  readonly runtime?: JourneyRuntime;
}

/**
 * Options for {@link useJourneyProgress}.
 *
 * `sequence` is forwarded to `resolveStepSequence` — chiefly `branch`, to
 * linearize a forking flow, and `input`, when the start step depends on it.
 * Mirroring `resolveStepSequence`, `sequence` is optional for a void-input
 * journey but required (carrying `input` or `start`) when the journey's
 * `initialState` / `start` need a non-void input.
 */
export type UseJourneyProgressOptions<TInput = unknown> = UseJourneyProgressBase &
  ([TInput] extends [void]
    ? { readonly sequence?: ResolveStepSequenceOptions<TInput> }
    : { readonly sequence: ResolveStepSequenceOptions<TInput> });

/**
 * Trailing options argument for {@link useJourneyProgress}: optional for a
 * void-input journey, required when the journey needs a non-void input so the
 * mandatory `sequence.input` / `sequence.start` can't be omitted.
 */
export type UseJourneyProgressArgs<TInput> = [TInput] extends [void]
  ? [options?: UseJourneyProgressOptions<TInput>]
  : [options: UseJourneyProgressOptions<TInput>];

export interface JourneyProgress {
  /**
   * 0-based position (`history.length`), so `0` on the first step. Tracks the
   * live instance, whereas `total` is the statically-resolved spine, so `index`
   * can reach or exceed `total` when the runtime path diverges (a fork walked
   * with a different `branch`, or steps past an unannotated transition).
   */
  readonly index: ComputedRef<number>;
  /**
   * Resolved sequence length — best-effort. Counts the statically-walkable
   * spine, so it is a *partial* total when the flow forks without a `branch`
   * resolver, stops at an unannotated transition, or is cut by `maxSteps`. A
   * definition with a derivable start always yields at least `1`; `null` only
   * when no step at all can be resolved.
   */
  readonly total: ComputedRef<number | null>;
  /** `progressLabel` of the current step, or `null`. */
  readonly label: ComputedRef<string | null>;
  /** The full resolved sequence — for breadcrumbs / a stepper. */
  readonly steps: ComputedRef<readonly ResolvedJourneyStep[]>;
}

/**
 * Vue analog of the React `useJourneyProgress` (production-feedback item 4):
 * `{ index, total }` for a running instance, plus the current step's `label`
 * and the full resolved sequence, all as `ComputedRef`s.
 *
 * `index` tracks the live instance (`history.length`); `total` / `label` come
 * from `resolveStepSequence` walking the definition's transition graph, so the
 * total is derived from the one place the flow is encoded — no second
 * ordered-step array to keep in sync.
 *
 * `instanceId` accepts a plain value, a ref, or a getter (mirroring the other
 * instance composables). `definition` and `options` are read once at setup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { instanceId } = useJourneyHost(checkoutHandle, { cartId })
 * const { index, total, label } = useJourneyProgress(instanceId, checkoutDef)
 * </script>
 * <template>
 *   <Progress v-if="total" :value="index + 1" :max="total" :label="label" />
 * </template>
 * ```
 */
export function useJourneyProgress<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TOutput,
  TMeta extends { [K in keyof TMeta]: unknown },
>(
  instanceId: MaybeRefOrGetter<InstanceId | null>,
  definition: JourneyDefinition<TModules, TState, TInput, TOutput, TMeta>,
  ...[options]: UseJourneyProgressArgs<TInput>
): JourneyProgress {
  const opts = (options ?? {}) as UseJourneyProgressBase & {
    readonly sequence?: ResolveStepSequenceOptions<TInput>;
  };
  const ctx = useJourneyContext();
  // `toRaw` for the same reason the host/outlet do it — a runtime that arrived
  // through a reactive prop is a proxy, and the runtime keys on raw identity.
  const runtime = toRaw(opts.runtime ?? ctx?.runtime ?? undefined) ?? null;

  const instance = useInstanceSnapshot(runtime, instanceId);

  // `definition` / `options` are plain values (not reactive), so the sequence
  // is resolved once at setup — the same read the React hook memoizes. The
  // tuple cast localizes the engine's documented "TInput is generic here"
  // erasure; `opts.sequence` already satisfies the input-or-start requirement.
  const steps = resolveStepSequence(
    definition,
    ...((opts.sequence === undefined ? [] : [opts.sequence]) as StepSequenceOptionsArg<TInput>),
  );

  const index = computed(() => (instance.value ? instance.value.history.length : 0));
  const total = computed(() => (steps.length > 0 ? steps.length : null));
  const label = computed<string | null>(() => {
    const current = instance.value?.step;
    if (current == null) return null;
    return (
      steps.find((s) => s.module === current.moduleId && s.entry === current.entry)
        ?.progressLabel ?? null
    );
  });
  const stepsRef = computed(() => steps);

  return { index, total, label, steps: stepsRef };
}
