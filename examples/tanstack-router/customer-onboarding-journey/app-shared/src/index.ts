import { createSharedHooks } from "@tanstack-react-modules/core";

// ---- Domain types used across modules + journey ----

export type PlanTier = "standard" | "pro" | "enterprise";

export interface SubscriptionPlan {
  readonly tier: PlanTier;
  readonly monthly: number;
}

export interface PlanHint {
  /** Tier the profile module recommended based on the account signals. */
  readonly suggestedTier: PlanTier;
  readonly rationale: string;
}

// ---- App slots (nothing dynamic in this example) ----

/**
 * No module contributes slots here. The workflow is expressed as a journey,
 * not as slot items. Keeping the slot map empty-but-declared documents that
 * intent — modules still get the typed dependency/slot surface through the
 * same `defineModule<AppDependencies, AppSlots>` pattern.
 */
export interface AppSlots {
  // Intentionally empty — this example renders exclusively via journey tabs.
  readonly commands: readonly never[];
}

// ---- Workspace actions contract ----

/**
 * Intent for opening a module-backed tab. Journey tabs are created via
 * `addJourneyTab` instead, so that starting the journey (which needs the
 * runtime) stays separate from tab bookkeeping (which does not).
 */
export interface OpenTabSpec {
  readonly kind: "module";
  readonly id: string;
  readonly entry?: string;
  readonly input?: unknown;
  readonly title?: string;
}

export interface OpenTabResult {
  readonly tabId: string;
}

/**
 * Intent for tracking an already-started journey as a tab. The caller mints
 * the `instanceId` via `journeys.start(...)` (where the runtime is already
 * in scope — e.g. `useJourneyContext()` in React land, or `manifest.journeys`
 * at bootstrap), then hands off here for tab-strip bookkeeping.
 */
export interface AddJourneyTabSpec {
  readonly instanceId: string;
  readonly journeyId: string;
  readonly input: unknown;
  readonly title?: string;
}

export interface AddJourneyTabResult {
  readonly tabId: string;
  readonly alreadyOpen: boolean;
}

/**
 * The shell implements this; modules consume it via `useService('workspace')`.
 * Pure tab bookkeeping — no knowledge of the journey runtime. Starting a
 * journey happens at the call site; this surface only records/activates tabs.
 */
export interface WorkspaceActions {
  /** @deprecated Use `openTab({ kind: 'module', id, input })` instead. */
  readonly openModuleTab: (moduleId: string, input?: unknown) => OpenTabResult;
  readonly openTab: (spec: OpenTabSpec) => OpenTabResult;
  readonly addJourneyTab: (spec: AddJourneyTabSpec) => AddJourneyTabResult;
  readonly closeTab: (tabId: string) => void;
}

// ---- Shared dependencies ----

export interface AppDependencies {
  readonly workspace: WorkspaceActions;
}

// ---- Typed hooks ----

export const { useService } = createSharedHooks<AppDependencies>();
