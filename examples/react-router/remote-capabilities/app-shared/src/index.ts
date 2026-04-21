import { createSharedHooks } from "@react-router-modules/core";
import type { RemoteModuleManifest, RemoteNavigationItem } from "@modular-react/core";

// ---- Slot item shapes (what the remote payload actually carries) ----

/**
 * Authentication strategy the backend has configured for this integration.
 * The shared page renders different auth-status UI per type (e.g. "Connect
 * OAuth…" vs "Paste API key"), so the set of valid values is a closed union
 * owned by the FE. Adding a new auth type is a code change.
 */
export type IntegrationAuthentication =
  | { readonly type: "oauth" }
  | { readonly type: "apikey" }
  | { readonly type: "none" };

/**
 * Filter descriptor. Each entry tells the shared page that this integration
 * supports a given server-side filter and what template query to send.
 * Filters the backend omits are not rendered — the shared page hides
 * unsupported inputs rather than showing dead controls.
 */
export type IntegrationFilter =
  | { readonly id: string; readonly type: "search"; readonly query: string }
  | { readonly id: string; readonly type: "daterange"; readonly query: string };

/**
 * Capability-map entry. Each capability key the FE knows about has a fixed
 * payload shape; if the backend sends an unknown key, the shared page simply
 * has no renderer for it (loud TS error if you try to read it without adding
 * it to this map).
 */
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
 * One generic integration — the full definition the backend returns.
 *
 * This is the slot-item type. Every rich per-integration field (auth, filters,
 * capabilities) lives here, NOT at the `RemoteModuleManifest` root. The
 * manifest is just an envelope: `{ id, version, slots: { integrations: [...] } }`.
 *
 * The same definition drives two things at once:
 *
 *  - **Catalog surface** — id/name/category/icon/description render a tile in
 *    the integrations grid (this example's equivalent of nav-style rendering).
 *  - **Capability-gated shared component** — the shared detail card reads
 *    `authentication`, `filters`, `capabilities` and conditionally renders
 *    UI (e.g. hides the "Start import" button when `importTracking` is absent).
 */
export interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: "crm" | "ticketing" | "analytics" | "marketing";
  /** Icon identifier — the shell maps this to a local renderer / emoji / sprite. */
  readonly icon: string;
  readonly description: string;
  readonly authentication: IntegrationAuthentication;
  readonly filters: readonly IntegrationFilter[];
  readonly capabilities: IntegrationCapabilities;
}

// ---- AppSlots: every slot must be a readonly array ----

export interface AppSlots {
  /** Generic integrations the current tenant is licensed for. Driven by backend. */
  integrations: readonly IntegrationDefinition[];
}

// ---- Remote manifest alias (the wire contract) ----

/**
 * The shape every backend manifest response must target.
 * Export this so the backend team (or an OpenAPI generator) can mirror it.
 */
export type AppRemoteManifest = RemoteModuleManifest<AppSlots, RemoteNavigationItem>;

// ---- Integrations store state ----

/**
 * Fetched manifests live in a store so `dynamicSlots(deps)` can read them
 * without re-fetching and so `recalculateSlots()` has something to subscribe
 * to. Actions live in state so they can be reached via `deps.integrations`
 * from a module's `onRegister(deps)` lifecycle hook.
 */
export interface IntegrationsStore {
  status: "idle" | "loading" | "ready" | "error";
  manifests: readonly AppRemoteManifest[];
  error: string | null;
  setManifests: (manifests: readonly AppRemoteManifest[]) => void;
  setStatus: (status: IntegrationsStore["status"]) => void;
  setError: (error: string | null) => void;
}

// ---- Services (non-reactive dependencies) ----

/**
 * The seam that makes this example runnable without a real server — the shell
 * wires a mock implementation that fetches a static JSON file. In production
 * you'd swap in a real HTTP call.
 */
export interface IntegrationsClient {
  fetchManifests: () => Promise<readonly AppRemoteManifest[]>;
}

// ---- The contract ----

export interface AppDependencies {
  integrations: IntegrationsStore;
  integrationsClient: IntegrationsClient;
}

// ---- Typed hooks (use these in all modules) ----

export const { useStore, useService, useReactiveService, useOptional } =
  createSharedHooks<AppDependencies>();
