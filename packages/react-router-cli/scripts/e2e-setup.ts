#!/usr/bin/env node

import { execSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dirname, "..", "dist", "cli.js");
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const TMP = resolve(import.meta.dirname, "..", ".e2e-output");
const PROJECT_DIR = resolve(TMP, "smoke-app");

function exec(cmd: string, cwd?: string) {
  execSync(cmd, { cwd, stdio: "inherit", timeout: 120_000 });
}

// Skip if already set up
if (existsSync(resolve(PROJECT_DIR, "node_modules"))) {
  console.log('E2E project already exists. Run "pnpm clean" first to re-scaffold.');
  process.exit(0);
}

mkdirSync(TMP, { recursive: true });

exec(`node ${CLI} init smoke-app --scope @smoke --module dashboard`, TMP);

// Build framework packages
exec("pnpm -r run build", REPO_ROOT);

// Override @react-router-modules/* to local (not yet on npm)
const rootPkg = JSON.parse(readFileSync(resolve(PROJECT_DIR, "package.json"), "utf-8"));
rootPkg.pnpm = {
  overrides: {
    "@react-router-modules/core": `link:${resolve(REPO_ROOT, "packages", "core")}`,
    "@react-router-modules/runtime": `link:${resolve(REPO_ROOT, "packages", "runtime")}`,
  },
};
writeFileSync(resolve(PROJECT_DIR, "package.json"), JSON.stringify(rootPkg, null, 2));

exec("pnpm install", PROJECT_DIR);

console.log("E2E setup complete.");
