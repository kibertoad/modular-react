import { defineJourney, defineJourneyHandle, selectModuleOrDefault } from "@modular-react/journeys";
import type { IntegrationKind } from "@example-rr-integration-setup/app-shared";
import type integrationPickerModule from "@example-rr-integration-setup/integration-picker";
import type genericIntegrationModule from "@example-rr-integration-setup/generic-integration";
import type githubModule from "@example-rr-integration-setup/github-module";
import type strapiModule from "@example-rr-integration-setup/strapi-module";

// All four imports are `import type` — modules are NOT pulled into this
// package's bundle. The runtime resolves step components by id against
// the registered descriptors at outlet-render time.
type IntegrationModules = {
  readonly "integration-picker": typeof integrationPickerModule;
  readonly github: typeof githubModule;
  readonly strapi: typeof strapiModule;
  readonly "generic-integration": typeof genericIntegrationModule;
};

export interface IntegrationSetupInput {
  readonly tenantId: string;
}

export interface IntegrationSetupState {
  readonly tenantId: string;
  readonly selected: IntegrationKind | null;
  readonly outcome:
    | { readonly kind: "github"; readonly repo: string; readonly webhookId: string }
    | { readonly kind: "strapi"; readonly baseUrl: string; readonly apiToken: string }
    | { readonly kind: IntegrationKind; readonly apiKey: string }
    | null;
}

// Bind the dispatcher to the journey's module map once. Same partial-
// inference reason as `defineJourney`: TypeScript can't infer `TKey` while
// also forcing `TModules` to be specified, so we curry on `TModules` here.
const select = selectModuleOrDefault<IntegrationModules>();

export const integrationSetupJourney = defineJourney<IntegrationModules, IntegrationSetupState>()({
  id: "integration-setup",
  version: "1.0.0",
  meta: {
    name: "Integration setup",
    category: "integrations",
  },

  initialState: ({ tenantId }: IntegrationSetupInput) => ({
    tenantId,
    selected: null,
    outcome: null,
  }),

  start: (state) => ({
    module: "integration-picker",
    entry: "pick",
    input: { tenantId: state.tenantId },
  }),

  transitions: {
    "integration-picker": {
      pick: {
        // The dispatch is the whole point of this example. Two integrations
        // (github, strapi) earn dedicated configure steps because their
        // auth/data shapes differ enough to warrant a tailored UI;
        // everything else (contentful, notion, …) funnels through the
        // generic form via the explicit fallback.
        //
        // **When to prefer `selectModule` (exhaustive) instead.** If every
        // integration we ship gets its own dedicated module, drop the
        // fallback and switch to `selectModule<IntegrationModules>()` —
        // adding a new value to `IntegrationKind` would then be a compile
        // error until the cases object grows a matching branch. With the
        // generic-fallback pattern below, a new kind silently flows into
        // the fallback, which is the *desired* default for a system where
        // most integrations are content with the generic UI.
        chosen: ({ output, state }) => ({
          state: { ...state, selected: output.kind },
          next: select(
            output.kind,
            {
              github: {
                entry: "configure",
                input: {
                  tenantId: state.tenantId,
                  // A real chooser would suggest a repo from the user's
                  // GitHub org listing — we keep a static placeholder so
                  // the e2e test has something deterministic to assert.
                  suggestedRepo: "modular-react/example",
                },
              },
              strapi: {
                entry: "configure",
                input: { tenantId: state.tenantId },
              },
            },
            // Fallback: any kind not covered above (contentful, notion,
            // future additions) lands here. The generic module reads
            // `kind` from input so it can title itself correctly.
            {
              module: "generic-integration",
              entry: "configure",
              input: { tenantId: state.tenantId, kind: output.kind },
            },
          ),
        }),
        cancelled: () => ({ abort: { reason: "user-cancelled" } }),
      },
    },
    github: {
      configure: {
        saved: ({ output, state }) => ({
          state: {
            ...state,
            outcome: { kind: "github", repo: output.repo, webhookId: output.webhookId },
          },
          complete: { kind: "github", repo: output.repo, webhookId: output.webhookId },
        }),
        cancelled: () => ({ abort: { reason: "user-cancelled" } }),
      },
    },
    strapi: {
      configure: {
        saved: ({ output, state }) => ({
          state: {
            ...state,
            outcome: { kind: "strapi", baseUrl: output.baseUrl, apiToken: output.apiToken },
          },
          complete: { kind: "strapi", baseUrl: output.baseUrl, apiToken: output.apiToken },
        }),
        cancelled: () => ({ abort: { reason: "user-cancelled" } }),
      },
    },
    "generic-integration": {
      configure: {
        saved: ({ output, state }) => ({
          state: {
            ...state,
            outcome: { kind: output.kind as IntegrationKind, apiKey: output.apiKey },
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
