import { readFileSync } from "node:fs";
import { resolve } from "pathe";

export function detectScope(projectRoot: string): string {
  const pkgPath = resolve(projectRoot, "app-shared", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const name: string = pkg.name;

  const match = name.match(/^(@[^/]+)\//);
  if (!match) {
    throw new Error(
      `Could not detect scope from app-shared package name: "${name}". Expected format: @scope/app-shared`,
    );
  }

  return match[1];
}
