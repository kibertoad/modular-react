import { useMemo } from "react";
import type { InstanceId, JourneyRuntime } from "@modular-frontend/journeys-engine";
import {
  resolveStepSequence,
  type JourneyDefinition,
  type ModuleTypeMap,
  type ResolvedJourneyStep,
  type ResolveStepSequenceOptions,
} from "@modular-frontend/journeys-engine";
import { useInstanceSnapshot } from "./instance-hooks.js";
import { useJourneyContext } from "./provider.js";

export interface UseJourneyProgressOptions<TInput = unknown> {
  /**
   * Runtime the `instanceId` belongs to. Defaults to the one from a
   * surrounding `<JourneyProvider>`. Pass explicitly to read progress for an
   * instance on a runtime other than the ambient one.
   */
  readonly runtime?: JourneyRuntime;
  /**
   * Forwarded to `resolveStepSequence` — most importantly `branch`, to
   * linearize a forking flow, and `input`, when the start step depends on it.
   *
   * The sequence is memoized on this object's identity, so pass a stable
   * reference (e.g. a module-level constant or a `useMemo`) rather than a fresh
   * literal each render if you want to avoid re-walking the graph per render.
   */
  readonly sequence?: ResolveStepSequenceOptions<TInput>;
}

export interface JourneyProgress {
  /**
   * 0-based position in the flow — `history.length`, so `0` on the first step.
   * Matches `useJourneyHost`'s `stepIndex`. Render "Step {index + 1} of {total}".
   *
   * Note `index` tracks the *live* instance while `total` comes from the
   * *statically-resolved* spine, so when the runtime path diverges from the
   * resolved one (a fork walked with a different `branch`, or steps past an
   * unannotated transition) `index` can reach or exceed `total`. Clamp at the
   * call site if you render a bounded stepper.
   */
  readonly index: number;
  /**
   * Total number of steps in the resolved sequence — the "N" in "Step X of N".
   *
   * Best-effort: it counts the statically-walkable spine `resolveStepSequence`
   * returns from the start step, which is a *partial* total when the flow forks
   * without a `branch` resolver, stops at an unannotated (bare-function)
   * transition, or is cut by `maxSteps`. It does not depend on a live instance —
   * a definition with a derivable start always yields at least `1`. `null` only
   * when no step at all can be resolved (an empty sequence).
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
  options: UseJourneyProgressOptions<TInput> = {},
): JourneyProgress {
  const context = useJourneyContext();
  const runtime = options.runtime ?? context?.runtime ?? null;

  const instance = useInstanceSnapshot(runtime, instanceId);

  const sequenceOptions = options.sequence;
  const steps = useMemo(
    () => resolveStepSequence(definition, sequenceOptions),
    [definition, sequenceOptions],
  );

  const index = instance ? instance.history.length : 0;
  const total = steps.length > 0 ? steps.length : null;

  const current = instance?.step;
  const label =
    current != null
      ? (steps.find((s) => s.module === current.moduleId && s.entry === current.entry)
          ?.progressLabel ?? null)
      : null;

  return { index, total, label, steps };
}
