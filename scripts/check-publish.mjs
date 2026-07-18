#!/usr/bin/env node
// Publish hygiene gate: run publint + Are-The-Types-Wrong (attw) on every
// published package.
//
// Why this exists: our downstream story rests on packaging correctness — most
// importantly that vue / vue-router / pinia stay `peerDependencies` (never
// bundled deps) so a consumer's types bind to their single copy, and that the
// `exports` map resolves types correctly across module systems. publint checks
// the manifest/exports; attw checks that the emitted types actually resolve for
// a real consumer under node16/bundler resolution. Both run on the packed
// tarball, i.e. exactly what a consumer installs.
//
// Requires each package to be built first (dist/ present) — the CI job runs
// `turbo run build --filter=./packages/*` beforehand.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgsDir = join(root, "packages");

const packages = [];
for (const entry of readdirSync(pkgsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(pkgsDir, entry.name, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.private) continue; // published packages only
  packages.push({ name: manifest.name, dir: join(pkgsDir, entry.name), manifest });
}

packages.sort((a, b) => a.name.localeCompare(b.name));

function run(cmd, args, cwd) {
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const failures = [];
for (const { name, dir, manifest } of packages) {
  if (!existsSync(join(dir, "dist"))) {
    failures.push({
      name,
      tool: "build",
      out: "dist/ missing — build the package before running publish checks.",
    });
    console.error(`✗ ${name}: dist/ missing`);
    continue;
  }

  // publint: manifest + exports correctness (strict = warnings fail too).
  const pub = run("pnpm", ["exec", "publint", "--strict", dir], root);

  const pkgFailures = [];
  if (!pub.ok) pkgFailures.push({ tool: "publint", out: pub.out });

  // attw checks that an *imported* entry resolves to types. Bin-only CLI
  // packages expose no importable entry (only `bin`, no exports/main/types), so
  // attw has nothing to resolve and reports a false NoResolution. Run attw only
  // for packages with a library entry point.
  const hasEntry = Boolean(manifest.exports || manifest.main || manifest.module || manifest.types);
  if (hasEntry) {
    // The @modular-* packages are intentionally ESM-only (`"type": "module"`,
    // no CJS export), so `--profile esm-only` treats the expected "CJS must use
    // dynamic import" note as OK while still catching broken type resolution.
    const attw = run("pnpm", ["exec", "attw", "--pack", dir, "--profile", "esm-only"], root);
    if (!attw.ok) pkgFailures.push({ tool: "attw", out: attw.out });
  }

  if (pkgFailures.length === 0) {
    console.log(`✓ ${name}`);
  } else {
    for (const f of pkgFailures) {
      console.error(`✗ ${name} [${f.tool}]:\n${f.out.trim()}\n`);
      failures.push({ name, ...f });
    }
  }
}

if (failures.length > 0) {
  console.error(
    `\ncheck:publish — ${failures.length} problem(s) across ${packages.length} packages.`,
  );
  process.exit(1);
}
console.log(`\ncheck:publish — OK across ${packages.length} published packages.`);
