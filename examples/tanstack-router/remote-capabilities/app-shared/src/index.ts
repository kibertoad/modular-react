import { createSharedHooks } from "@tanstack-react-modules/core";
import type { RemoteModuleManifest, RemoteNavigationItem } from "@modular-react/core";

// ---- Closed kind union --------------------------------------------------

/**
 * The closed set of integration ids the FE knows how to render. The remote
 * manifest is trusted to populate `IntegrationDefinition.id` with one of
 * these values; an unknown value would mean the backend shipped something
 * the FE doesn't have a renderer for, and the validator at the wire
 * boundary throws before the page sees it.
 *
 * Two of these (`salesforce`, `hubspot`) earn dedicated configure modules
 * because their auth flows differ enough to warrant tailored UI; the rest
 * funnel through the generic configure step via the journey's
 * `selectModuleOrDefault` fallback.
 */
export type IntegrationKind = "salesforce" | "hubspot" | "zendesk" | "mixpanel" | "pipedrive";

// ---- Slot item shapes (the rich remote payload) -------------------------

/**
 * Authentication strategy the backend has configured for this integration.
 * The shared catalog page renders different auth-status UI per type; the
 * generic configure step also branches on this when prompting for credentials.
 */
export type IntegrationAuthentication =
  | { readonly type: "oauth"; readonly authorizeUrl?: string }
  | { readonly type: "apikey" }
  | { readonly type: "none" };

/**
 * Filter descriptor. Each entry tells the catalog tile that this
 * integration supports a given server-side filter; unsupported filters
 * simply are not rendered.
 */
export type IntegrationFilter =
  | { readonly id: string; readonly type: "search"; readonly query: string }
  | { readonly id: string; readonly type: "daterange"; readonly query: string };

/**
 * Capability-map entry. Each capability key the FE knows about has a fixed
 * payload shape — adding a new capability requires extending this type
 * (loud TS error if a renderer reads a key that's not in the map).
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
 * `id` is narrowed to {@link IntegrationKind} so the journey's
 * `selectModuleOrDefault` dispatch keys against the same union. Adding a
 * kind requires a single edit here; the journey's fallback handles it
 * automatically (no compile error) and the dedicated cases keep their
 * exhaustive narrowing for the kinds that earned them.
 */
export interface IntegrationDefinition {
  readonly id: IntegrationKind;
  readonly name: string;
  readonly category: "crm" | "ticketing" | "analytics" | "marketing";
  /** Icon identifier — the catalog page maps this to a local emoji / sprite. */
  readonly icon: string;
  readonly description: string;
  readonly authentication: IntegrationAuthentication;
  readonly filters: readonly IntegrationFilter[];
  readonly capabilities: IntegrationCapabilities;
}

// ---- AppSlots ------------------------------------------------------------

export interface AppSlots {
  /**
   * Generic integrations the current tenant is licensed for. Populated by
   * the integration-catalog module's `dynamicSlots` from the merged remote
   * manifests held in `IntegrationsStore.manifests`.
   */
  readonly integrations: readonly IntegrationDefinition[];
}

// ---- Remote manifest alias (the wire contract) --------------------------

/**
 * The shape every backend manifest response must target. Export this so a
 * backend team or OpenAPI generator can mirror it exactly. The runtime
 * validator in `services/integrations-client.ts` is the only place we
 * widen `unknown` into this type.
 */
export type AppRemoteManifest = RemoteModuleManifest<AppSlots, RemoteNavigationItem>;

// ---- Integrations store -------------------------------------------------

/**
 * Holds fetched manifests + the set of integration ids the current tenant
 * has already finished configuring. The catalog module's `dynamicSlots`
 * reads `manifests`; the page reads `connected` to render a "Connected"
 * badge once a journey terminates successfully. Both are reactive — the
 * shell subscribes the store to `recalculateSlots()` so async fetches and
 * journey terminations both drive a re-render through the standard path.
 */
export interface IntegrationsStore {
  status: "idle" | "loading" | "ready" | "error";
  manifests: readonly AppRemoteManifest[];
  /** Ids the user has just finished configuring this session. */
  connected: ReadonlySet<IntegrationKind>;
  error: string | null;
  setManifests: (manifests: readonly AppRemoteManifest[]) => void;
  setStatus: (status: IntegrationsStore["status"]) => void;
  setError: (error: string | null) => void;
  markConnected: (id: IntegrationKind) => void;
  resetConnected: () => void;
}

// ---- Services (non-reactive dependencies) -------------------------------

/**
 * The seam that makes this example runnable without a real server — the
 * shell wires a mock implementation that fetches a static JSON file. In
 * production you'd swap in a real HTTP call.
 */
export interface IntegrationsClient {
  fetchManifests: () => Promise<readonly AppRemoteManifest[]>;
}

// ---- The contract --------------------------------------------------------

export interface AppDependencies {
  integrations: IntegrationsStore;
  integrationsClient: IntegrationsClient;
  /** Unused at runtime — included so journeys/modules can `requires: ["tenantId"]`. */
  tenantId: string;
}

// ---- Typed hooks (use these in all modules) -----------------------------

export const { useStore, useService, useReactiveService, useOptional } =
  createSharedHooks<AppDependencies>();
