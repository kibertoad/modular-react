import type {
  AppRemoteManifest,
  IntegrationAuthentication,
  IntegrationCapabilities,
  IntegrationDefinition,
  IntegrationFilter,
  IntegrationKind,
  IntegrationsClient,
} from "@example-tsr-remote-capabilities/app-shared";

// `as const satisfies Record<X, true>` keeps each runtime allowlist in
// lockstep with the corresponding type union — adding a value to e.g.
// `IntegrationKind` without adding the key here is a compile error, so
// the validator can never silently let an unknown kind through.
const INTEGRATION_KIND_SET = {
  salesforce: true,
  hubspot: true,
  zendesk: true,
  mixpanel: true,
  pipedrive: true,
} as const satisfies Record<IntegrationKind, true>;

const INTEGRATION_CATEGORY_SET = {
  crm: true,
  ticketing: true,
  analytics: true,
  marketing: true,
} as const satisfies Record<IntegrationDefinition["category"], true>;

const FILTER_TYPE_SET = {
  search: true,
  daterange: true,
} as const satisfies Record<IntegrationFilter["type"], true>;

const SYNC_DIRECTION_SET = {
  push: true,
  pull: true,
  bidirectional: true,
} as const satisfies Record<
  NonNullable<IntegrationCapabilities["contactSync"]>["data"]["direction"],
  true
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isIntegrationKind(value: string): value is IntegrationKind {
  return value in INTEGRATION_KIND_SET;
}

function isIntegrationCategory(value: string): value is IntegrationDefinition["category"] {
  return value in INTEGRATION_CATEGORY_SET;
}

function isFilterType(value: string): value is IntegrationFilter["type"] {
  return value in FILTER_TYPE_SET;
}

function isSyncDirection(
  value: unknown,
): value is NonNullable<IntegrationCapabilities["contactSync"]>["data"]["direction"] {
  return typeof value === "string" && value in SYNC_DIRECTION_SET;
}

// `never`-returning helper so the calling code reads as a single
// expression and TS's control-flow analysis treats every call as a
// throw — the caller doesn't need a separate `return` statement and
// the value is narrowed past the failure point on the success branch.
function fail(where: string, reason: string): never {
  throw new Error(`${where} ${reason}`);
}

function validateAuthentication(raw: unknown, where: string): IntegrationAuthentication {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  if (raw.type === "oauth") {
    if (raw.authorizeUrl === undefined) return { type: "oauth" };
    if (typeof raw.authorizeUrl !== "string") {
      fail(`${where}.authorizeUrl`, "must be a string when present");
    }
    return { type: "oauth", authorizeUrl: raw.authorizeUrl };
  }
  if (raw.type === "apikey") return { type: "apikey" };
  if (raw.type === "none") return { type: "none" };
  fail(`${where}.type`, `must be one of oauth, apikey, none (got ${JSON.stringify(raw.type)})`);
}

function validateFilter(raw: unknown, where: string): IntegrationFilter {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    fail(`${where}.id`, "must be a non-empty string");
  }
  if (typeof raw.query !== "string") fail(`${where}.query`, "must be a string");
  if (typeof raw.type !== "string" || !isFilterType(raw.type)) {
    fail(
      `${where}.type`,
      `must be one of ${Object.keys(FILTER_TYPE_SET).join(", ")} (got ${JSON.stringify(raw.type)})`,
    );
  }
  return { id: raw.id, type: raw.type, query: raw.query };
}

function validateImportTracking(
  raw: unknown,
  where: string,
): NonNullable<IntegrationCapabilities["importTracking"]> {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  if (raw.version !== 1) fail(`${where}.version`, "must be 1");
  if (!isPlainObject(raw.data)) fail(`${where}.data`, "must be an object");
  if (typeof raw.data.pollingIntervalMs !== "number") {
    fail(`${where}.data.pollingIntervalMs`, "must be a number");
  }
  return { version: 1, data: { pollingIntervalMs: raw.data.pollingIntervalMs } };
}

function validateContactSync(
  raw: unknown,
  where: string,
): NonNullable<IntegrationCapabilities["contactSync"]> {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  if (raw.version !== 1) fail(`${where}.version`, "must be 1");
  if (!isPlainObject(raw.data)) fail(`${where}.data`, "must be an object");
  if (!isSyncDirection(raw.data.direction)) {
    fail(`${where}.data.direction`, `must be one of ${Object.keys(SYNC_DIRECTION_SET).join(", ")}`);
  }
  return { version: 1, data: { direction: raw.data.direction } };
}

function validateCapabilities(raw: unknown, where: string): IntegrationCapabilities {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  // `-readonly` for ergonomic property assignment during construction;
  // the function's return type re-imposes readonly via `IntegrationCapabilities`.
  // Unknown capability keys are silently dropped — the FE wouldn't have a
  // renderer for them anyway, so refusing the whole manifest would be
  // hostile to forward-compat.
  const out: { -readonly [K in keyof IntegrationCapabilities]: IntegrationCapabilities[K] } = {};
  if (raw.importTracking !== undefined) {
    out.importTracking = validateImportTracking(raw.importTracking, `${where}.importTracking`);
  }
  if (raw.contactSync !== undefined) {
    out.contactSync = validateContactSync(raw.contactSync, `${where}.contactSync`);
  }
  return out;
}

function validateIntegration(raw: unknown, where: string): IntegrationDefinition {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  if (typeof raw.id !== "string" || !isIntegrationKind(raw.id)) {
    fail(
      `${where}.id`,
      `must be one of ${Object.keys(INTEGRATION_KIND_SET).join(", ")} (got ${JSON.stringify(raw.id)})`,
    );
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    fail(`${where}.name`, "must be a non-empty string");
  }
  if (typeof raw.category !== "string" || !isIntegrationCategory(raw.category)) {
    fail(`${where}.category`, `must be one of ${Object.keys(INTEGRATION_CATEGORY_SET).join(", ")}`);
  }
  if (typeof raw.icon !== "string") fail(`${where}.icon`, "must be a string");
  if (typeof raw.description !== "string") fail(`${where}.description`, "must be a string");
  if (!Array.isArray(raw.filters)) fail(`${where}.filters`, "must be an array");

  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    icon: raw.icon,
    description: raw.description,
    authentication: validateAuthentication(raw.authentication, `${where}.authentication`),
    filters: raw.filters.map((f, fi) => validateFilter(f, `${where}.filters[${fi}]`)),
    capabilities: validateCapabilities(raw.capabilities, `${where}.capabilities`),
  };
}

function validateManifest(raw: unknown, where: string): AppRemoteManifest {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    fail(`${where}.id`, "must be a non-empty string");
  }
  if (typeof raw.version !== "string") fail(`${where}.version`, "must be a string");

  let slots: AppRemoteManifest["slots"];
  if (raw.slots !== undefined) {
    if (!isPlainObject(raw.slots)) fail(`${where}.slots`, "must be an object");
    if (raw.slots.integrations === undefined) {
      slots = {};
    } else {
      if (!Array.isArray(raw.slots.integrations)) {
        fail(`${where}.slots.integrations`, "must be an array");
      }
      slots = {
        integrations: raw.slots.integrations.map((integration, j) =>
          validateIntegration(integration, `${where}.slots.integrations[${j}]`),
        ),
      };
    }
  }

  let meta: AppRemoteManifest["meta"];
  if (raw.meta !== undefined) {
    if (!isPlainObject(raw.meta)) fail(`${where}.meta`, "must be an object");
    // `Record<string, unknown>` from `isPlainObject` widens cleanly to
    // `Readonly<Record<string, unknown>>` — no cast.
    meta = raw.meta;
  }

  // The catalog page never reads `manifest.navigation`, so the validator
  // omits it from the result rather than maintaining a parallel
  // RemoteNavigationItem validator. Add a `validateNavigationItem` here
  // when the catalog starts consuming nav contributions.

  return {
    id: raw.id,
    version: raw.version,
    ...(slots !== undefined ? { slots } : {}),
    ...(meta !== undefined ? { meta } : {}),
  };
}

/**
 * Runtime validation at the wire boundary. Hand-rolled to keep the example
 * dependency-light; in a real project use zod / valibot.
 *
 * Every leaf validator constructs a typed value out of validated fields,
 * so the return path never falls back to `as unknown as AppRemoteManifest`.
 * That has two payoffs:
 *
 *  - Adding a field to `IntegrationDefinition` (or any of the union types
 *    backed by an `INTEGRATION_*_SET`) surfaces here as a missing-property
 *    or missing-key error instead of a silent gap.
 *  - The `unknown` payload becomes `AppRemoteManifest` only at the leaf
 *    `return { … }` expressions where each property has just been
 *    proven to match its declared type — no double-unknown cast at the
 *    function boundary.
 */
function validateManifests(raw: unknown): readonly AppRemoteManifest[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Manifest response must be an array, got ${typeof raw}`);
  }
  return raw.map((entry, i) => validateManifest(entry, `Manifest[${i}]`));
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
