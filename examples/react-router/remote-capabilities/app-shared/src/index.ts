import { createSharedHooks } from "@react-router-modules/core";
import type { RemoteModuleManifest, RemoteNavigationItem } from "@modular-react/core";

// ---- Slot item shapes (what the remote payload actually carries) ----

/**
 * Catalog tile describing one generic integration (Salesforce, HubSpot, …).
 * Backend-owned: adding a new one means adding a row to the API response.
 */
export interface IntegrationTile {
  readonly id: string;
  readonly name: string;
  readonly category: "crm" | "ticketing" | "analytics" | "marketing";
  /** Icon identifier — the shell maps this to a local renderer / emoji / sprite. */
  readonly icon: string;
  readonly description: string;
}

// ---- AppSlots: every slot must be a readonly array ----

export interface AppSlots {
  /** Generic integrations the current tenant is licensed for. Driven by backend. */
  integrations: readonly IntegrationTile[];
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
