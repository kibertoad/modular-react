import { readFileSync } from "node:fs";
import { dirname, resolve } from "pathe";
import { fileURLToPath } from "node:url";

let cached: string | null = null;

/**
 * Read the catalog package's own version from its package.json. The bundled
 * dist layout is `dist/cli/package-version.js`, so the package root is two
 * levels up. Cached because the file never changes during a CLI run.
 */
export function getPackageVersion(): string {
  if (cached !== null) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, "..", "..", "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== "string") {
    throw new Error(`Could not read version from ${pkgPath}`);
  }
  cached = parsed.version;
  return parsed.version;
}
