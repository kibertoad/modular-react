import { defineJourney, defineJourneyHandle, selectModuleOrDefault } from "@modular-react/journeys";
import type {
  IntegrationDefinition,
  IntegrationKind,
} from "@example-tsr-remote-capabilities/app-shared";
import type genericIntegrationModule from "@example-tsr-remote-capabilities/generic-integration";
import type salesforceModule from "@example-tsr-remote-capabilities/salesforce";
import type hubspotModule from "@example-tsr-remote-capabilities/hubspot";

// All three imports are `import type` — modules are NOT pulled into this
// package's bundle. The runtime resolves step components by id against
// the registered descriptors at outlet-render time.
type IntegrationModules = {
  readonly salesforce: typeof salesforceModule;
  readonly hubspot: typeof hubspotModule;
  readonly "generic-integration": typeof genericIntegrationModule;
};

export interface IntegrationSetupInput {
  readonly tenantId: string;
  /**
   * The remote-manifest definition the catalog tile was rendered from.
   * Carrying the whole object across the journey input is deliberate:
   *
   *  - `start()` reads `integration.id` to dispatch.
   *  - The dedicated configure components read `name` for headings.
   *  - The generic configure component reads `authentication.type` to
   *    vary its field copy without forking into a per-integration UI.
   *
   * Keeping the chain JSON-serializable matters here too — the journey's
   * persistence adapter (when one is wired) will round-trip this blob.
   */
  readonly integration: IntegrationDefinition;
}

export interface IntegrationSetupState {
  readonly tenantId: string;
  readonly integration: IntegrationDefinition;
  readonly outcome:
    | { readonly kind: "salesforce"; readonly instanceUrl: string; readonly accessToken: string }
    | { readonly kind: "hubspot"; readonly portalId: string; readonly privateAppToken: string }
    | { readonly kind: IntegrationKind; readonly apiKey: string }
    | null;
}

// Bind the dispatcher to the journey's module map once. Same partial-
// inference reason as `defineJourney`: TypeScript can't infer `TKey` while
// also forcing `TModules` to be specified, so we curry on `TModules` here.
const select = selectModuleOrDefault<IntegrationModules>();

/**
 * Integration setup journey.
 *
 * The catalog tile calls `runtime.start(integrationSetupHandle, { tenantId,
 * integration })`. `start()` is where the dispatch happens — there's no
 * picker step because the catalog already knows which integration the user
 * clicked. `selectModuleOrDefault` keys the dispatch on the integration's
 * `id`:
 *
 *  - `salesforce` → dedicated `<ConfigureSalesforce>` (instance URL +
 *    OAuth fields the generic form can't represent)
 *  - `hubspot` → dedicated `<ConfigureHubspot>` (portal id + private-app
 *    token)
 *  - everything else (zendesk, mixpanel, pipedrive, …) → generic
 *    `<ConfigureGeneric>` via the explicit fallback
 *
 * **When to prefer `selectModule` (exhaustive) instead.** If every
 * integration shipped earned its own dedicated module, drop the fallback
 * and switch to `selectModule<IntegrationModules>()` — adding a value to
 * `IntegrationKind` would then be a compile error until the cases object
 * grows a matching branch. With the generic-fallback pattern below, a new
 * kind delivered by the backend silently flows into the fallback, which
 * is the *desired* default for a system whose integration set grows
 * primarily through remote manifests.
 */
export const integrationSetupJourney = defineJourney<IntegrationModules, IntegrationSetupState>()({
  id: "integration-setup",
  version: "1.0.0",
  meta: {
    name: "Integration setup",
    category: "integrations",
  },

  initialState: ({ tenantId, integration }: IntegrationSetupInput) => ({
    tenantId,
    integration,
    outcome: null,
  }),

  start: (state) =>
    select(
      state.integration.id,
      {
        salesforce: {
          entry: "configure",
          input: { tenantId: state.tenantId, integration: state.integration },
        },
        hubspot: {
          entry: "configure",
          input: { tenantId: state.tenantId, integration: state.integration },
        },
      },
      {
        module: "generic-integration",
        entry: "configure",
        input: { tenantId: state.tenantId, integration: state.integration },
      },
    ),

  transitions: {
    salesforce: {
      configure: {
        saved: ({ output, state }) => ({
          state: {
            ...state,
            outcome: {
              kind: "salesforce",
              instanceUrl: output.instanceUrl,
              accessToken: output.accessToken,
            },
          },
          complete: {
            kind: "salesforce",
            instanceUrl: output.instanceUrl,
            accessToken: output.accessToken,
          },
        }),
        cancelled: () => ({ abort: { reason: "user-cancelled" } }),
      },
    },
    hubspot: {
      configure: {
        saved: ({ output, state }) => ({
          state: {
            ...state,
            outcome: {
              kind: "hubspot",
              portalId: output.portalId,
              privateAppToken: output.privateAppToken,
            },
          },
          complete: {
            kind: "hubspot",
            portalId: output.portalId,
            privateAppToken: output.privateAppToken,
          },
        }),
        cancelled: () => ({ abort: { reason: "user-cancelled" } }),
      },
    },
    "generic-integration": {
      configure: {
        saved: ({ output, state }) => ({
          state: {
            ...state,
            outcome: { kind: output.kind, apiKey: output.apiKey },
          },
          complete: { kind: output.kind, apiKey: output.apiKey },
        }),
        cancelled: () => ({ abort: { reason: "user-cancelled" } }),
      },
    },
  },
});

export type IntegrationSetupJourney = typeof integrationSetupJourney;

export const integrationSetupHandle = defineJourneyHandle(integrationSetupJourney);
export type IntegrationSetupHandle = typeof integrationSetupHandle;
