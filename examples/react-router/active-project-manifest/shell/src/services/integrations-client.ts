import type { AppRemoteManifest, IntegrationsClient } from "@example-active/app-shared";

/**
 * Runtime validation at the wire boundary. Hand-rolled to keep the example
 * dependency-light; in a real project use zod / valibot.
 */
function validateManifest(raw: unknown): AppRemoteManifest {
  if (raw == null || typeof raw !== "object") {
    throw new Error("Manifest response must be an object");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id.length === 0) {
    throw new Error("Manifest.id must be a non-empty string");
  }
  if (typeof m.version !== "string") {
    throw new Error("Manifest.version must be a string");
  }
  if (m.slots != null && typeof m.slots !== "object") {
    throw new Error("Manifest.slots must be an object");
  }
  return m as unknown as AppRemoteManifest;
}

/**
 * One endpoint per project — the "backend" is a static file under `public/`.
 * A real API would look like `GET /api/projects/:id/integration` returning
 * the single manifest for the active project, or 404 if the project has no
 * integration configured.
 */
export function createIntegrationsClient(): IntegrationsClient {
  return {
    async fetchManifest(projectId) {
      const response = await fetch(`/projects/${encodeURIComponent(projectId)}.json`);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(
          `Failed to fetch manifest for ${projectId}: ${response.status} ${response.statusText}`,
        );
      }
      const raw: unknown = await response.json();
      return validateManifest(raw);
    },
  };
}
