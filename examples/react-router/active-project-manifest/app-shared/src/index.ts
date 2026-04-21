import { createSharedHooks } from "@react-router-modules/core";
import type { RemoteModuleManifest, RemoteNavigationItem } from "@modular-react/core";

// ---- Slot item shapes (what the remote payload actually carries) ----

/** Authentication strategy the backend configured for the active project's integration. */
export type IntegrationAuthentication =
  | { readonly type: "oauth" }
  | { readonly type: "apikey" }
  | { readonly type: "none" };

/** Supported server-side filter descriptor. */
export type IntegrationFilter =
  | { readonly id: string; readonly type: "search"; readonly query: string }
  | { readonly id: string; readonly type: "daterange"; readonly query: string };

/** Capability map — each key unlocks a specific piece of UI in the shared component. */
export interface IntegrationCapabilities {
  readonly importTracking?: {
    readonly version: 1;
    readonly data: { readonly pollingIntervalMs: number };
  };
  readonly contactSync?: {
    readonly version: 1;
    readonly data: { readonly direction: "push" | "pull" | "bidirectional" };
  };
}

/**
 * The rich integration definition for the currently active project.
 *
 * Identical in structure to the catalog example's slot item — the whole point
 * of this example is that the same capability-gated shared component works
 * whether the manifest arrives as part of a larger catalog or as the active
 * project's single integration.
 */
export interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: "crm" | "ticketing" | "analytics" | "marketing";
  readonly icon: string;
  readonly description: string;
  readonly authentication: IntegrationAuthentication;
  readonly filters: readonly IntegrationFilter[];
  readonly capabilities: IntegrationCapabilities;
}

// ---- AppSlots ----

/**
 * One slot, zero-or-one items: the active project's integration (or nothing
 * when no project is selected yet). The shell renders the single element;
 * there is never more than one in this topology.
 */
export interface AppSlots {
  integration: readonly IntegrationDefinition[];
}

// ---- Projects the user can switch between ----

/**
 * Projects are a fixed list in this example (hard-coded in the shell). In a
 * real app they'd come from a separate API (`/api/projects`) and the shell
 * would fetch them once after login.
 */
export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

// ---- Remote manifest alias (the wire contract) ----

/**
 * Each project's `/api/projects/:id/integration` endpoint returns exactly one
 * of these. Swap-topology: we never hold more than one manifest at a time.
 */
export type AppRemoteManifest = RemoteModuleManifest<AppSlots, RemoteNavigationItem>;

// ---- Integrations store state ----

/**
 * Swap-topology store. Holds:
 *
 * - `activeProjectId` — what the user picked in the sidebar.
 * - `activeManifest` — the manifest fetched for that project, or `null` while
 *   it's loading / no project is selected yet.
 *
 * `selectProject` is an async store action that fires the fetch and writes
 * the result back. Keeping it on the store (a closure over the client)
 * avoids both a subscription in `onRegister` and fetch logic leaking into
 * the picker component.
 */
export interface IntegrationsStore {
  status: "idle" | "loading" | "ready" | "error";
  activeProjectId: string | null;
  activeManifest: AppRemoteManifest | null;
  error: string | null;
  /** UI calls this; the store fetches the new manifest and swaps it in. */
  selectProject: (projectId: string | null) => Promise<void>;
}

// ---- Services (non-reactive dependencies) ----

export interface IntegrationsClient {
  /** Resolves to the manifest for the given project, or `null` if it has none. */
  fetchManifest: (projectId: string) => Promise<AppRemoteManifest | null>;
}

// ---- The contract ----

export interface AppDependencies {
  integrations: IntegrationsStore;
  integrationsClient: IntegrationsClient;
}

// ---- Typed hooks (use these in all modules) ----

export const { useStore, useService, useReactiveService, useOptional } =
  createSharedHooks<AppDependencies>();
