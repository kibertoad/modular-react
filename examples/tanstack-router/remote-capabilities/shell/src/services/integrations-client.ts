import type {
  AppRemoteManifest,
  IntegrationsClient,
} from "@example-tsr-remote-capabilities/app-shared";

/**
 * Closed sets the validator checks against. Kept in sync with the
 * `IntegrationKind` / `IntegrationDefinition.category` /
 * `IntegrationAuthentication["type"]` / `IntegrationFilter["type"]` unions
 * in `app-shared`. Adding a member to one of those types means adding it
 * here too — drift is caught by the e2e tests, but a `satisfies`-style
 * guard would tighten this further if you want a compile-time link.
 */
const INTEGRATION_KINDS = new Set(["salesforce", "hubspot", "zendesk", "mixpanel", "pipedrive"]);
const INTEGRATION_CATEGORIES = new Set(["crm", "ticketing", "analytics", "marketing"]);
const AUTH_TYPES = new Set(["oauth", "apikey", "none"]);
const FILTER_TYPES = new Set(["search", "daterange"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function validateIntegration(integration: unknown, manifestIndex: number, slotIndex: number): void {
  const where = `Manifest[${manifestIndex}].slots.integrations[${slotIndex}]`;
  if (!isPlainObject(integration)) {
    throw new Error(`${where} must be an object`);
  }

  const id = integration.id;
  if (typeof id !== "string" || !INTEGRATION_KINDS.has(id)) {
    throw new Error(
      `${where}.id must be one of ${Array.from(INTEGRATION_KINDS).join(", ")} (got ${JSON.stringify(id)})`,
    );
  }

  if (typeof integration.name !== "string" || integration.name.length === 0) {
    throw new Error(`${where}.name must be a non-empty string`);
  }

  if (
    typeof integration.category !== "string" ||
    !INTEGRATION_CATEGORIES.has(integration.category)
  ) {
    throw new Error(
      `${where}.category must be one of ${Array.from(INTEGRATION_CATEGORIES).join(", ")}`,
    );
  }

  if (typeof integration.icon !== "string") {
    throw new Error(`${where}.icon must be a string`);
  }

  if (typeof integration.description !== "string") {
    throw new Error(`${where}.description must be a string`);
  }

  const auth = integration.authentication;
  if (!isPlainObject(auth) || typeof auth.type !== "string" || !AUTH_TYPES.has(auth.type)) {
    throw new Error(
      `${where}.authentication.type must be one of ${Array.from(AUTH_TYPES).join(", ")}`,
    );
  }

  if (!Array.isArray(integration.filters)) {
    throw new Error(`${where}.filters must be an array`);
  }
  integration.filters.forEach((filter, fi) => {
    if (!isPlainObject(filter)) {
      throw new Error(`${where}.filters[${fi}] must be an object`);
    }
    if (typeof filter.id !== "string" || filter.id.length === 0) {
      throw new Error(`${where}.filters[${fi}].id must be a non-empty string`);
    }
    if (typeof filter.type !== "string" || !FILTER_TYPES.has(filter.type)) {
      throw new Error(
        `${where}.filters[${fi}].type must be one of ${Array.from(FILTER_TYPES).join(", ")}`,
      );
    }
    if (typeof filter.query !== "string") {
      throw new Error(`${where}.filters[${fi}].query must be a string`);
    }
  });

  if (!isPlainObject(integration.capabilities)) {
    throw new Error(`${where}.capabilities must be an object`);
  }
}

/**
 * Runtime validation at the wire boundary. Hand-rolled to keep the example
 * dependency-light; in a real project use zod / valibot.
 *
 * The validator is the only place a payload widens from `unknown` to
 * `AppRemoteManifest`, so it has to defend the entire shape consumers
 * rely on — including `slots.integrations[*]`. Without per-integration
 * validation, an unknown `id` would pass through and silently land in the
 * journey's `selectModuleOrDefault` fallback (or worse, with a value the
 * UI's `Record<IntegrationKind, …>` lookups can't resolve).
 */
function validateManifests(raw: unknown): readonly AppRemoteManifest[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Manifest response must be an array, got ${typeof raw}`);
  }
  return raw.map((entry, i) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Manifest[${i}] is not an object`);
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new Error(`Manifest[${i}].id must be a non-empty string`);
    }
    if (typeof entry.version !== "string") {
      throw new Error(`Manifest[${i}].version must be a string`);
    }

    if (entry.slots !== undefined) {
      if (!isPlainObject(entry.slots)) {
        throw new Error(`Manifest[${i}].slots must be an object`);
      }
      const integrations = entry.slots.integrations;
      if (integrations !== undefined) {
        if (!Array.isArray(integrations)) {
          throw new Error(`Manifest[${i}].slots.integrations must be an array`);
        }
        integrations.forEach((integration, j) => {
          validateIntegration(integration, i, j);
        });
      }
    }

    return entry as unknown as AppRemoteManifest;
  });
}

/**
 * Real-looking IntegrationsClient: issues a `fetch()` to an endpoint the
 * "backend" would serve. In this example the endpoint is a static JSON
 * under `public/` — identical wire path, no server required. Swap the URL
 * for a real API in production.
 */
export function createIntegrationsClient(endpoint = "/integrations.json"): IntegrationsClient {
  return {
    async fetchManifests() {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch manifests: ${response.status} ${response.statusText}`);
      }
      const raw: unknown = await response.json();
      return validateManifests(raw);
    },
  };
}
