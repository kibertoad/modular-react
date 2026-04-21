import type { AppRemoteManifest, IntegrationsClient } from "@example/app-shared";

/**
 * Runtime validation at the wire boundary. Hand-rolled to keep the example
 * dependency-light; in a real project use zod / valibot.
 */
function validateManifests(raw: unknown): readonly AppRemoteManifest[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Manifest response must be an array, got ${typeof raw}`);
  }
  return raw.map((entry, i) => {
    if (entry == null || typeof entry !== "object") {
      throw new Error(`Manifest[${i}] is not an object`);
    }
    const m = entry as Record<string, unknown>;
    if (typeof m.id !== "string" || m.id.length === 0) {
      throw new Error(`Manifest[${i}].id must be a non-empty string`);
    }
    if (typeof m.version !== "string") {
      throw new Error(`Manifest[${i}].version must be a string`);
    }
    if (m.slots != null && typeof m.slots !== "object") {
      throw new Error(`Manifest[${i}].slots must be an object`);
    }
    // Trust the slot contents past this point — the structural TS type on the
    // return value is what consumers rely on. Tighten per-slot shapes here if
    // you want stricter runtime guarantees.
    return m as unknown as AppRemoteManifest;
  });
}

/**
 * Real-looking IntegrationsClient: issues a `fetch()` to an endpoint the
 * "backend" would serve. In this example the endpoint is a static JSON under
 * `public/` — identical wire path, no server required. Swap the URL for a
 * real API in production.
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
