import { cpSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "pathe";
import { fileURLToPath } from "node:url";
import type { CatalogTheme } from "../config/types.js";

/**
 * Locate the prebuilt SPA assets shipped inside the package. The SPA is
 * built once at package publish time into `dist-spa/`; the CLI copies that
 * directory verbatim into the user's output dir.
 */
function spaAssetsDir(): string | null {
  // dist/cli/spa-bundle.js — go up two levels to reach the package root.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, "..", "..", "dist-spa");
  return existsSync(candidate) ? candidate : null;
}

export async function copySpaAssets(outDir: string): Promise<void> {
  const src = spaAssetsDir();
  if (!src) {
    console.warn(
      "[catalog] dist-spa/ not found in package. SPA assets were NOT copied. " +
        "This is expected during local development before `pnpm build:spa` has run; " +
        "the catalog.json output is still complete.",
    );
    return;
  }
  cpSync(src, outDir, { recursive: true });
}

/**
 * Emit `theme.json` (consumed by the SPA at runtime) and `theme.css` (loaded
 * by index.html so brand colors apply before the SPA's JS executes).
 */
export function writeThemeFile(outDir: string, theme: CatalogTheme | undefined): void {
  const resolved: CatalogTheme = theme ?? {};
  writeFileSync(resolve(outDir, "theme.json"), JSON.stringify(resolved, null, 2));

  const cssLines: string[] = [":root {"];
  if (resolved.primaryColor) cssLines.push(`  --catalog-primary: ${resolved.primaryColor};`);
  if (resolved.backgroundColor) cssLines.push(`  --catalog-bg: ${resolved.backgroundColor};`);
  cssLines.push("}");
  writeFileSync(resolve(outDir, "theme.css"), cssLines.join("\n") + "\n");
}
