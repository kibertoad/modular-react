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

export type OpenTabSpec =
  | {
      readonly kind: "module";
      readonly id: string;
      readonly entry?: string;
      readonly input?: unknown;
      readonly title?: string;
    }
  | {
      readonly kind: "journey";
      readonly id: string;
      readonly input?: unknown;
      readonly title?: string;
    };

export interface OpenTabResult {
  readonly tabId: string;
  readonly instanceId?: string;
}

/**
 * The shell implements this; modules consume it via `useService('workspace')`.
 * Journey-aware tabs go through `openTab({ kind: 'journey', ... })`; plain
 * module tabs stay on the same surface for uniformity.
 */
export interface WorkspaceActions {
  /** @deprecated Use `openTab({ kind: 'module', id, input })` instead. */
  readonly openModuleTab: (moduleId: string, input?: unknown) => OpenTabResult;
  readonly openTab: (spec: OpenTabSpec) => OpenTabResult;
  readonly closeTab: (tabId: string) => void;
}

// ---- Shared dependencies ----

export interface AppDependencies {
  readonly workspace: WorkspaceActions;
}

// ---- Typed hooks ----

export const { useService } = createSharedHooks<AppDependencies>();
