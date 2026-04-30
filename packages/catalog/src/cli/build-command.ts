import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "pathe";
import { defineCommand } from "citty";
import { harvest } from "../harvester/harvest.js";
import { buildCatalogModel, buildManifest } from "../schema/build-model.js";
import { getPackageVersion } from "./package-version.js";
import { loadCatalogConfig } from "./load-config.js";
import { copySpaAssets, writeThemeFile } from "./spa-bundle.js";

/**
 * `modular-react-catalog build` — runs the harvester once and writes a
 * deployable directory to the configured `out` path. Output layout:
 *
 *     <out>/
 *       index.html
 *       assets/...        ← prebuilt SPA assets copied from dist-spa/
 *       catalog.json      ← harvested model
 *       manifest.json     ← build sidecar (counts, source roots, package version)
 *       theme.json        ← theme tokens for the SPA to consume at runtime
 *       theme.css         ← CSS custom properties derived from config.theme
 */
export const buildCommand = defineCommand({
  meta: {
    name: "build",
    description: "Harvest descriptors and produce a deployable catalog directory.",
  },
  args: {
    config: {
      type: "string",
      description: "Path to catalog.config.{ts,js,mts,mjs}. Auto-detected by default.",
    },
    out: {
      type: "string",
      description: "Output directory (overrides config.out). Defaults to dist-catalog.",
    },
    cwd: {
      type: "string",
      description: "Project root (defaults to current working directory).",
    },
  },
  async run({ args }) {
    const cwd = args.cwd ? resolve(process.cwd(), args.cwd) : process.cwd();
    const { config, configPath } = await loadCatalogConfig(cwd, args.config);

    const outDir = resolve(cwd, args.out ?? config.out ?? "dist-catalog");

    console.log(`[catalog] Using config: ${configPath}`);
    console.log(`[catalog] Output directory: ${outDir}`);
    console.log(`[catalog] Scanning ${config.roots.length} root(s)...`);

    const { entries, errors } = await harvest(config, dirname(configPath));

    if (errors.length > 0) {
      console.warn(`[catalog] ${errors.length} file(s) failed to load:`);
      for (const err of errors) {
        console.warn(`  ${err.filePath}\n    ${err.message}`);
      }
    }

    const model = buildCatalogModel(entries, {
      title: config.title,
      extensions: config.extensions,
    });
    const manifest = buildManifest(model, config, getPackageVersion());

    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "catalog.json"), JSON.stringify(model, null, 2));
    writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    writeThemeFile(outDir, config.theme);
    await copySpaAssets(outDir);

    console.log(
      `[catalog] Wrote ${model.modules.length} module(s), ` +
        `${model.journeys.length} journey(s) to ${outDir}.`,
    );
  },
});
