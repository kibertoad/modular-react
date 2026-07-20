import type {
  EntryNamesByMountKindOf,
  JourneyStepMeta,
  ModuleTypeMap,
} from "@modular-frontend/core";
import type { JourneyDefinition } from "./types.js";
import { isAnnotatedTransition, isTerminalSentinel } from "./define-transition.js";

/**
 * One step in a resolved journey sequence — the `(module, entry)` identity plus
 * any declarative {@link JourneyStepMeta} the definition attached under
 * `steps[module][entry]`.
 */
export interface ResolvedJourneyStep {
  readonly module: string;
  readonly entry: string;
  /** `path` from the step's {@link JourneyStepMeta}, if declared. */
  readonly path?: string;
  /** `progressLabel` from the step's {@link JourneyStepMeta}, if declared. */
  readonly progressLabel?: string;
}

/**
 * Detect `any` at the type level so the generic-erased path (a definition typed
 * as `JourneyDefinition<any, …>`, the registry) keeps a loose
 * `{ module: string; entry: string }` ref instead of distributing the mapped
 * type over `any`. Mirrors the same gate `StepSpec` uses in core.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * A `(module, entry)` reference into a journey's own module map — a candidate
 * forward step, an explicit `start`, or a `branch` pick.
 *
 * Narrowed to the journey's real modules and their journey-mountable entries —
 * exactly the vocabulary a transition `target` is checked against — so a typo
 * in an explicit `start` (`{ module: "typo", entry: "missing" }`) or a `branch`
 * return is a **compile error** rather than a fake step the walk would happily
 * emit. Falls back to the loose string shape on the generic-erased path (where
 * `TModules` is `any`).
 */
export type StepSequenceRef<TModules extends ModuleTypeMap = ModuleTypeMap> =
  IsAny<TModules> extends true
    ? { readonly module: string; readonly entry: string }
    : {
        [M in keyof TModules & string]: {
          [E in EntryNamesByMountKindOf<TModules[M], "journey"> & string]: {
            readonly module: M;
            readonly entry: E;
          };
        }[EntryNamesByMountKindOf<TModules[M], "journey"> & string];
      }[keyof TModules & string];

/**
 * Walk-tuning options that never depend on the journey's input type — always
 * optional. The input-carrying `input` field lives on
 * {@link ResolveStepSequenceOptions}, which requires it (or `start`) for a
 * non-void-input journey.
 */
export interface StepSequenceWalkOptions<TModules extends ModuleTypeMap = ModuleTypeMap> {
  /**
   * Explicit first step. Skips calling `initialState` / `start` — useful when
   * the start step is dynamic on input in a way that does not affect the
   * sequence, or when resolving a sub-sequence from a mid-flow step. Supplying
   * this satisfies the start requirement for a non-void-input journey, since
   * the input-consuming factories are never called.
   *
   * Checked against the journey's real `(module, entry)` vocabulary — a step
   * the journey does not declare is a compile error.
   */
  readonly start?: StepSequenceRef<TModules>;
  /**
   * Fork resolver. When a step's transitions declare more than one distinct
   * forward `(module, entry)` target, the walk cannot linearize on its own —
   * this callback picks which branch to follow. Return one of `ctx.targets`
   * (identity not required — matched by `module` + `entry`), or `undefined` to
   * stop the sequence at this fork. Not called for steps with a single forward
   * target.
   */
  readonly branch?: (ctx: {
    readonly module: string;
    readonly entry: string;
    readonly targets: readonly StepSequenceRef<TModules>[];
  }) => StepSequenceRef<TModules> | undefined;
  /**
   * Hard cap on sequence length — a backstop against a pathological graph.
   * Default 256. The walk also stops on its own when it revisits a step
   * (cycle) or reaches a step with no forward target.
   */
  readonly maxSteps?: number;
}

/**
 * Options for {@link resolveStepSequence}.
 *
 * For a **void-input** journey every field is optional — `resolveStepSequence(def)`
 * is valid. For a journey whose `initialState` / `start` need a **non-void**
 * input, the options must supply the start of the walk explicitly: either
 * `input` (handed to the factories to compute the first step, ignored when
 * `start` is present) or `start` (naming the first step and skipping the
 * factories). This makes `resolveStepSequence(def)` a compile error exactly
 * when omitting `input` would otherwise call `initialState(undefined)`.
 */
export type ResolveStepSequenceOptions<
  TInput = unknown,
  TModules extends ModuleTypeMap = ModuleTypeMap,
> = StepSequenceWalkOptions<TModules> &
  ([TInput] extends [void]
    ? {
        /** Input handed to the factories. Optional for void-input journeys. */
        readonly input?: TInput;
      }
    :
        | {
            /** Input handed to `initialState` / `start` to compute the first step. */
            readonly input: TInput;
          }
        | {
            /** Explicit first step — skips (and so does not need) `input`. */
            readonly start: StepSequenceRef<TModules>;
          });

/**
 * Trailing options argument for {@link resolveStepSequence}: optional for a
 * void-input journey, required (carrying `input` or `start`) when the journey
 * needs a non-void input — so omitting it is a compile error precisely when it
 * would call `initialState(undefined)`. Consumers that forward options to
 * `resolveStepSequence` (e.g. the `useJourneyProgress` hooks) reuse this tuple.
 */
export type StepSequenceOptionsArg<TInput, TModules extends ModuleTypeMap = ModuleTypeMap> = [
  TInput,
] extends [void]
  ? [options?: ResolveStepSequenceOptions<TInput, TModules>]
  : [options: ResolveStepSequenceOptions<TInput, TModules>];

/**
 * Result of walking a journey's transition graph — the ordered step list plus
 * whether the walk reached a genuine end of the flow.
 *
 * `complete` is the fact a "Step X of N" total needs but a bare `steps.length`
 * cannot supply: it is `true` only when the walk terminated at a step that can
 * *only* end the journey (every transition leads to `complete` / `abort`), and
 * `false` when the walk was cut short — an unresolved fork (no/rejecting
 * `branch`), a bare (unannotated) or wildcard-only step, a `"invoke"` that
 * hands off to a child, a cycle, or the `maxSteps` cap. When `complete` is
 * `false`, `steps.length` is only a **lower bound** on the real step count, so
 * a progress UI must not present it as a confident total (see
 * `useJourneyProgress`, which surfaces `total: null` in that case).
 */
export interface StepSequenceResult {
  readonly steps: readonly ResolvedJourneyStep[];
  readonly complete: boolean;
}

const DEFAULT_MAX_STEPS = 256;

/**
 * Derive an ordered step list for a journey by walking its transition graph
 * statically, following the `targets` each {@link defineTransition} handler
 * declares. Returns the linear spine from the start step forward — for a
 * branching flow, pass `options.branch` to choose the path at each fork.
 *
 * This is the runtime companion to the catalog harvester's build-time
 * destination extraction: it lets an app derive URL-segment ordering and a
 * "Step X of N" total from the *one* place the flow is already encoded (the
 * transitions), deleting the hand-maintained ordered-step arrays that item 4
 * of the production-feedback tracker flagged as duplicated, drift-prone glue.
 *
 * **Requires handlers annotated with `defineTransition`.** The walk reads each
 * handler's `targets` (stamped by `defineTransition`). A step whose transitions
 * are all *bare* function handlers has no statically-known forward target, so
 * the sequence stops there. Terminal sentinels (`"complete"` / `"abort"` /
 * `"invoke"`) carry no next step and are skipped. Only the per-step
 * `transitions` map is walked — `wildcard` fall-through handlers are not
 * followed, so a step whose only forward movement is a wildcard also ends the
 * sequence.
 *
 * Unless `options.start` is supplied, the first step is computed by invoking
 * `definition.initialState(options.input)` then `definition.start(...)`; these
 * author-supplied factories must be safe to call with the provided `input`
 * (pass `options.start` to skip them entirely).
 *
 * Each returned step carries any `path` / `progressLabel` declared under
 * `definition.steps[module][entry]`.
 *
 * Returns just the step array. When you also need to know whether the walk
 * reached a genuine end of the flow (so a partial spine is not mistaken for the
 * true total), call {@link resolveStepSequenceResult}.
 *
 * @example
 * ```ts
 * const steps = resolveStepSequence(checkout);
 * const total = steps.length;                    // "Step X of N"
 * const paths = steps.map((s) => s.path ?? `${s.module}/${s.entry}`);
 * ```
 */
export function resolveStepSequence<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TOutput,
  TMeta extends { [K in keyof TMeta]: unknown },
>(
  definition: JourneyDefinition<TModules, TState, TInput, TOutput, TMeta>,
  ...args: StepSequenceOptionsArg<TInput, TModules>
): readonly ResolvedJourneyStep[] {
  return walkStepSequence(definition, args[0]).steps;
}

/**
 * {@link resolveStepSequence} that also reports whether the walk reached a
 * genuine terminal step (see {@link StepSequenceResult.complete}). Use this
 * when a caller must distinguish a full spine from one cut short by a fork,
 * a bare/wildcard step, an invoke, a cycle, or the `maxSteps` cap — the
 * progress hooks use it so a partial length is never rendered as a confident
 * "Step X of N" total.
 */
export function resolveStepSequenceResult<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TOutput,
  TMeta extends { [K in keyof TMeta]: unknown },
>(
  definition: JourneyDefinition<TModules, TState, TInput, TOutput, TMeta>,
  ...args: StepSequenceOptionsArg<TInput, TModules>
): StepSequenceResult {
  return walkStepSequence(definition, args[0]);
}

// The public generics guarantee `input`/`start` at the boundary; the walk reads
// the erased shape (module ids / entry names are strings on the wire), so it
// takes the options as `unknown` and normalizes to a flat readable view —
// forwarding the `TModules`-typed `branch` callback through a typed parameter
// would trip callback-variance checks for no benefit here.
function walkStepSequence(definition: AnyDefinition, options: unknown): StepSequenceResult {
  const opts = (options ?? {}) as StepSequenceWalkOptions & { readonly input?: unknown };
  const maxSteps = normalizeMaxSteps(opts.maxSteps);

  let current: StepSequenceRef | undefined = opts.start ?? deriveStart(definition, opts.input);

  const sequence: ResolvedJourneyStep[] = [];
  const visited = new Set<string>();
  let complete = false;

  while (current && sequence.length < maxSteps) {
    const key = stepKey(current.module, current.entry);
    if (visited.has(key)) break; // cycle — a linear spine visits each step once
    visited.add(key);

    const meta = readStepMeta(definition, current.module, current.entry);
    sequence.push({
      module: current.module,
      entry: current.entry,
      ...(meta?.path !== undefined ? { path: meta.path } : {}),
      ...(meta?.progressLabel !== undefined ? { progressLabel: meta.progressLabel } : {}),
    });

    const { targets, terminal } = classifyStep(definition, current.module, current.entry);
    if (targets.length === 0) {
      // No forward target. Either this step can only end the journey (a genuine
      // terminal — the spine is complete) or the walk simply cannot see past it
      // (bare/wildcard handler, invoke hand-off) — a partial spine.
      complete = terminal;
      break;
    }

    if (targets.length === 1) {
      current = targets[0];
    } else {
      // Fork — the resolver picks. Its return is matched back against `targets`
      // by `module` + `entry` (identity not required), so a `undefined` return
      // or a ref that isn't one of the declared targets stops the sequence here
      // (an unresolved fork — the spine is partial).
      const picked: StepSequenceRef | undefined = opts.branch?.({
        module: current.module,
        entry: current.entry,
        targets,
      });
      current = picked
        ? targets.find((t) => t.module === picked.module && t.entry === picked.entry)
        : undefined;
    }
  }

  return { steps: sequence, complete };
}

function normalizeMaxSteps(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return DEFAULT_MAX_STEPS;
  return Math.floor(value);
}

function stepKey(module: string, entry: string): string {
  // JSON-encode the pair so a module or entry name that itself contains the
  // separator can't collide two distinct steps onto the same visited key.
  return JSON.stringify([module, entry]);
}

/**
 * Compute the first step by running the definition's `initialState` + `start`.
 * These are author-supplied pure factories; a journey whose `initialState`
 * needs a non-void input must pass it via `options.input`.
 */
function deriveStart(definition: AnyDefinition, input: unknown): StepSequenceRef {
  const state = definition.initialState(input);
  const spec = definition.start(state, input);
  return { module: spec.module, entry: spec.entry };
}

function readStepMeta(
  definition: AnyDefinition,
  module: string,
  entry: string,
): JourneyStepMeta | undefined {
  const steps = definition.steps as
    | Record<string, Record<string, JourneyStepMeta | undefined> | undefined>
    | undefined;
  return steps?.[module]?.[entry];
}

/**
 * Classify a step for the walk:
 *
 * - `targets` — the distinct forward `(module, entry)` targets declared by any
 *   annotated exit handler on `transitions[module][entry]`. Bare handlers and
 *   terminal sentinels contribute nothing. Order follows first-declaration
 *   order across exits, deduped.
 * - `terminal` — `true` only when this step can *exclusively* end the journey:
 *   it has at least one annotated transition, no forward step ref, no bare
 *   handler, no `"invoke"` sentinel, and at least one `"complete"` / `"abort"`
 *   sentinel. A step that stops the walk for any other reason (bare handler,
 *   wildcard-only, invoke hand-off, or simply no declared transitions) is
 *   `terminal: false` — the walk cannot prove it is the flow's real end.
 */
function classifyStep(
  definition: AnyDefinition,
  module: string,
  entry: string,
): { readonly targets: readonly StepSequenceRef[]; readonly terminal: boolean } {
  const transitions = definition.transitions as
    | Record<string, Record<string, Record<string, unknown> | undefined> | undefined>
    | undefined;
  const perEntry = transitions?.[module]?.[entry];
  if (!perEntry) return { targets: [], terminal: false };

  const refs: StepSequenceRef[] = [];
  const seen = new Set<string>();
  let hasAnnotated = false;
  let hasBare = false;
  let hasInvoke = false;
  let hasEndSentinel = false; // "complete" | "abort"
  for (const [exitName, handler] of Object.entries(perEntry)) {
    // `allowBack` is a sibling boolean flag on the per-entry map, not a handler.
    if (exitName === "allowBack") continue;
    if (!isAnnotatedTransition(handler)) {
      hasBare = true;
      continue;
    }
    hasAnnotated = true;
    for (const target of handler.targets) {
      if (isTerminalSentinel(target)) {
        if (target === "invoke") hasInvoke = true;
        else hasEndSentinel = true;
        continue;
      }
      const key = stepKey(target.module, target.entry);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ module: target.module, entry: target.entry });
    }
  }
  const terminal = refs.length === 0 && hasAnnotated && !hasBare && !hasInvoke && hasEndSentinel;
  return { targets: refs, terminal };
}

/**
 * Internal alias for the generic-erased definition — `resolveStepSequence`
 * walks the definition structurally (module ids and entry names are strings on
 * the wire), so the helpers operate on the erased shape to avoid threading the
 * five generics through every internal call.
 */
type AnyDefinition = JourneyDefinition<any, any, any, any, any>;
