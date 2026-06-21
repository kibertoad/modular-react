import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "pathe";
import type { CliPreset } from "../preset.js";
import { resolveProject } from "../utils/resolve-project.js";
import { detectScope } from "../utils/detect-scope.js";
import { addCatalogToRootPackageJson } from "../utils/transform.js";
import { catalogConfig, CATALOG_CONFIG_FILENAME } from "../templates/catalog.js";

/**
 * Write `catalog.config.ts` at the workspace root and wire
 * `@modular-react/catalog` (devDependency + `catalog:build`/`catalog:serve`
 * scripts) into the root `package.json`. Shared by `create catalog` and
 * `init --with-catalog`. Returns `false` when a catalog config already
 * existed (so callers can report "already configured") — but still
 * reconciles the root `package.json` wiring, which is idempotent and
 * self-heals a workspace whose config survived a previous partial run.
 */
export function bootstrapCatalog(args: {
  root: string;
  projectName: string;
  scope: string;
}): boolean {
  const configPath = resolve(args.root, CATALOG_CONFIG_FILENAME);
  const alreadyConfigured = existsSync(configPath);

  // Always reconcile the root package.json wiring first. It's idempotent,
  // so a run whose previous attempt wrote the config but failed before
  // updating package.json can repair itself on the next invocation.
  addCatalogToRootPackageJson(args.root);

  if (alreadyConfigured) {
    return false;
  }

  writeFileSync(configPath, catalogConfig({ projectName: args.projectName, scope: args.scope }));
  return true;
}

/** Best-effort workspace name: the root `package.json` `name`, else the directory name. */
function detectProjectName(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
    if (typeof pkg.name === "string" && pkg.name.length > 0) return pkg.name;
  } catch {
    // Fall back to the directory name below.
  }
  return basename(root);
}

export function createCreateCatalogCommand(_preset: CliPreset) {
  return defineCommand({
    meta: {
      name: "catalog",
      description:
        "Scaffold a catalog.config.ts and wire @modular-react/catalog into the workspace root (see @modular-react/catalog)",
    },
    args: {},
    async run() {
      const project = resolveProject();
      const scope = detectScope(project.root);
      const projectName = detectProjectName(project.root);

      const created = bootstrapCatalog({ root: project.root, projectName, scope });

      if (!created) {
        const msg = `Catalog is already configured (${CATALOG_CONFIG_FILENAME} exists at ${project.root}).`;
        console.error(msg);
        process.exit(1);
      }

      const summary = [
        `Config:  ${CATALOG_CONFIG_FILENAME}`,
        `Scans:   modules/*/src/index.ts, journeys/*/src/index.ts`,
        `Scripts: catalog:build, catalog:serve (added to root package.json)`,
        "",
        "Next:",
        "  - Run pnpm install to link @modular-react/catalog.",
        "  - pnpm catalog:build   # harvest modules + journeys into dist-catalog/",
        "  - pnpm catalog:serve   # preview the generated catalog",
      ].join("\n");

      p.note(summary, "Catalog configured");
      p.outro("Done!");
    },
  });
}
