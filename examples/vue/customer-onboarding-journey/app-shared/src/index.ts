import { createSharedComposables } from "@modular-vue/vue";

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
 * same `defineModule<AppDependencies, AppSlots>()` pattern.
 */
export interface AppSlots {
  // Intentionally empty — this example renders exclusively via journey tabs.
  readonly commands: readonly never[];
}

// ---- Workspace actions contract ----

/**
 * Intent for tracking an already-started journey as a tab. The caller mints
 * the `instanceId` via `runtime.start(...)` (where the runtime is already in
 * scope — e.g. `useJourneyContext()` in a component, or `manifest.journeys`
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
  readonly addJourneyTab: (spec: AddJourneyTabSpec) => AddJourneyTabResult;
  readonly closeTab: (tabId: string) => void;
}

// ---- Shared dependencies ----

export interface AppDependencies {
  readonly workspace: WorkspaceActions;
}

// ---- Typed composables ----

// The Vue analog of the React example's `createSharedHooks`. Modules that need
// a shared dependency read it with the typed `useService` composable.
export const { useService } = createSharedComposables<AppDependencies>();
