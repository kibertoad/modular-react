#!/usr/bin/env node
// Lockfile tripwire: fail if a guarded package resolves to more than one
// physical instance of the SAME version.
//
// Why this exists: vue-router 5 folded in unplugin-vue-router and declares
// `vite` / `pinia` / `@vue/compiler-sfc` as OPTIONAL peer deps. pnpm keys a
// package's virtual-store dir by its resolved peers, so if a peer-forming dep
// (notably vite/rolldown) floats between versions, pnpm mints multiple physical
// copies of vue-router at the same version. Its public types are nominally
// branded (unique symbols + module augmentation), so `RouteRecordRaw` from one
// copy is "not assignable" to another — a cryptic `vue-tsc` failure three CI
// jobs downstream. This check catches the split at the lockfile instead.
//
// Multiple DIFFERENT versions of a guarded package are allowed (e.g. vite 7 for
// the catalog SPA alongside vite 8 for the Vue stack) — only same-version
// duplication is a defect.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Packages whose same-version duplication breaks cross-package type identity.
const GUARDED = ["vue-router", "vue", "vite", "pinia"];

const lockPath = join(dirname(fileURLToPath(import.meta.url)), "..", "pnpm-lock.yaml");
const lines = readFileSync(lockPath, "utf8").split("\n");

// Collect the keys under the top-level `snapshots:` block — each key is one
// physical instance (name@version + peer-context suffix).
const instanceKeys = [];
let inSnapshots = false;
for (const line of lines) {
  if (/^[a-zA-Z]/.test(line)) inSnapshots = line.startsWith("snapshots:");
  if (!inSnapshots) continue;
  const m = line.match(/^ {2}'?((?:@[^/]+\/)?[^@'\s][^@]*@[^:]+?)'?:\s*$/);
  if (m) instanceKeys.push(m[1]);
}

if (instanceKeys.length === 0) {
  console.error(
    "check-lockfile-dedup: found no snapshot entries — lockfile format may have changed. Update this script.",
  );
  process.exit(2);
}

// name -> version -> count of physical instances
const counts = new Map();
for (const key of instanceKeys) {
  const nm = key.match(/^((?:@[^/]+\/)?[^@]+)@([^(]+)/);
  if (!nm) continue;
  const [, name, version] = nm;
  if (!GUARDED.includes(name)) continue;
  const byVersion = counts.get(name) ?? new Map();
  byVersion.set(version, (byVersion.get(version) ?? 0) + 1);
  counts.set(name, byVersion);
}

const offenders = [];
for (const [name, byVersion] of counts) {
  for (const [version, count] of byVersion) {
    if (count > 1) offenders.push({ name, version, count });
  }
}

if (offenders.length > 0) {
  console.error("check-lockfile-dedup: duplicate same-version instances found:\n");
  for (const { name, version, count } of offenders) {
    console.error(`  ✗ ${name}@${version} — ${count} instances`);
    for (const key of instanceKeys.filter(
      (k) => k.startsWith(`${name}@${version}(`) || k === `${name}@${version}`,
    )) {
      console.error(`      ${key}`);
    }
  }
  console.error(
    "\nA guarded package has multiple physical copies at one version — usually a\n" +
      "peer-forming dep (vite/rolldown) floating between versions. Pin it to a\n" +
      "single version in pnpm-workspace.yaml `overrides` so the copy collapses.\n" +
      "See the vite/rolldown override notes in pnpm-workspace.yaml.",
  );
  process.exit(1);
}

console.log(`check-lockfile-dedup: OK — no duplicate instances of ${GUARDED.join(", ")}.`);
