import { useMemo } from "react";
import type { InstanceId, JourneyRuntime } from "@modular-frontend/journeys-engine";
import {
  resolveStepSequenceResult,
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
   * Runtime the `instanceId` belongs to. Defaults to the one from a
   * surrounding `<JourneyProvider>`. Pass explicitly to read progress for an
   * instance on a runtime other than the ambient one.
   */
  readonly runtime?: JourneyRuntime;
}

/**
 * Options for {@link useJourneyProgress}.
 *
 * `sequence` is forwarded to `resolveStepSequence` — most importantly `branch`,
 * to linearize a forking flow, and `input`, when the start step depends on it.
 * The sequence is memoized on this object's identity, so pass a stable
 * reference (e.g. a module-level constant or a `useMemo`) rather than a fresh
 * literal each render if you want to avoid re-walking the graph per render.
 *
 * Mirroring `resolveStepSequence`, `sequence` is optional for a void-input
 * journey but required (carrying `input` or `start`) when the journey's
 * `initialState` / `start` need a non-void input.
 */
export type UseJourneyProgressOptions<
  TInput = unknown,
  TModules extends ModuleTypeMap = ModuleTypeMap,
> = UseJourneyProgressBase &
  ([TInput] extends [void]
    ? { readonly sequence?: ResolveStepSequenceOptions<TInput, TModules> }
    : { readonly sequence: ResolveStepSequenceOptions<TInput, TModules> });

/**
 * Trailing options argument for {@link useJourneyProgress}: optional for a
 * void-input journey, required when the journey needs a non-void input so the
 * mandatory `sequence.input` / `sequence.start` can't be omitted.
 */
export type UseJourneyProgressArgs<TInput, TModules extends ModuleTypeMap = ModuleTypeMap> = [
  TInput,
] extends [void]
  ? [options?: UseJourneyProgressOptions<TInput, TModules>]
  : [options: UseJourneyProgressOptions<TInput, TModules>];

export interface JourneyProgress {
  /**
   * 0-based position in the flow. Render "Step {index + 1} of {total}".
   *
   * Derived from the *resolved sequence*: the position of the instance's
   * current step within `steps`. This is why it is correct under a
   * `maxHistory` cap — unlike `history.length`, which the runtime trims and
   * which would then under-count on later steps. When the live step is not on
   * the resolved spine (a fork walked with a different `branch`, or a step past
   * an unannotated transition) it falls back to `history.length`, best-effort,
   * and can then reach or exceed `total`; clamp at the call site if you render a
   * bounded stepper. `0` before an instance exists.
   */
  readonly index: number;
  /**
   * Total number of steps in the resolved sequence — the "N" in "Step X of N",
   * or `null` when that total cannot be trusted.
   *
   * It is a number only when the walk reached a genuine end of the flow (a
   * step that can *only* complete/abort). It is `null` when the sequence is
   * *partial* — an unresolved fork (no/rejecting `branch`), a bare
   * (unannotated) or wildcard-only step, a `"invoke"` hand-off to a child, a
   * cycle, or the `maxSteps` cap — because the statically-walkable length is
   * then only a lower bound, and rendering it as the total produces nonsense
   * like "Step 2 of 1". Guard your progress UI on `total != null`; use `steps`
   * directly if you want the partial list for a breadcrumb.
   */
  readonly total: number | null;
  /**
   * `progressLabel` of the step the instance is currently on, if the matching
   * resolved step declared one. `null` otherwise.
   */
  readonly label: string | null;
  /** The full resolved sequence, so callers can render breadcrumbs / a stepper. */
  readonly steps: readonly ResolvedJourneyStep[];
}

/**
 * Progress for a running journey instance — the `{ index, total }` pair item 4
 * of the production-feedback tracker asked for, plus the current step's label
 * and the full resolved sequence.
 *
 * `index` comes from the live instance (`history.length`, so it rewinds when
 * the journey does); `total` and `label` come from `resolveStepSequence`, which
 * walks the definition's transition graph. Because the total is derived from
 * the one place the flow is encoded, there is no second ordered-step array to
 * keep in sync — the duplication item 4 flagged.
 *
 * The sequence is memoized on `definition` + `options.sequence`; for a forking
 * flow, pass `options.sequence.branch` so the total reflects the chosen path.
 *
 * @example
 * ```tsx
 * function CheckoutRoute() {
 *   const { instanceId } = useJourneyHost(checkoutHandle, { cartId });
 *   const { index, total, label } = useJourneyProgress(instanceId, checkoutDef);
 *   return (
 *     <>
 *       {total != null && <Progress value={index + 1} max={total} label={label} />}
 *       {instanceId && <JourneyOutlet instanceId={instanceId} />}
 *     </>
 *   );
 * }
 * ```
 */
export function useJourneyProgress<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TOutput,
  TMeta extends { [K in keyof TMeta]: unknown },
>(
  instanceId: InstanceId | null,
  definition: JourneyDefinition<TModules, TState, TInput, TOutput, TMeta>,
  ...[options]: UseJourneyProgressArgs<TInput, TModules>
): JourneyProgress {
  const opts = (options ?? {}) as UseJourneyProgressBase & {
    readonly sequence?: ResolveStepSequenceOptions<TInput, TModules>;
  };
  const context = useJourneyContext();
  const runtime = opts.runtime ?? context?.runtime ?? null;

  const instance = useInstanceSnapshot(runtime, instanceId);

  const sequenceOptions = opts.sequence;
  const resolved = useMemo(
    // The tuple cast localizes the same "TInput is generic here" erasure the
    // engine documents: `sequenceOptions` already satisfies the input-or-start
    // requirement via `UseJourneyProgressOptions`, so forward it as-is.
    () =>
      resolveStepSequenceResult(
        definition,
        ...((sequenceOptions === undefined ? [] : [sequenceOptions]) as StepSequenceOptionsArg<
          TInput,
          TModules
        >),
      ),
    [definition, sequenceOptions],
  );
  const steps = resolved.steps;

  const current = instance?.step;
  // Position within the resolved spine — trim-immune, unlike `history.length`.
  // Falls back to the live history depth when the current step is off the spine.
  const resolvedIndex =
    current != null
      ? steps.findIndex((s) => s.module === current.moduleId && s.entry === current.entry)
      : -1;
  const index = resolvedIndex >= 0 ? resolvedIndex : instance ? instance.history.length : 0;

  // Only a completed walk yields a trustworthy total; a partial spine would
  // render "Step 2 of 1" once the runtime advances past it.
  const total = resolved.complete && steps.length > 0 ? steps.length : null;

  const label =
    current != null
      ? (steps.find((s) => s.module === current.moduleId && s.entry === current.entry)
          ?.progressLabel ?? null)
      : null;

  return { index, total, label, steps };
}
