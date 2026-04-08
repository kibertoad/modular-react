import { existsSync } from "node:fs";
import { resolve, dirname } from "pathe";

export interface ProjectRoot {
  root: string;
  appSharedDir: string;
  shellDir: string;
  modulesDir: string;
}

export function resolveProject(from: string = process.cwd()): ProjectRoot {
  let current = resolve(from);

  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return {
        root: current,
        appSharedDir: resolve(current, "app-shared"),
        shellDir: resolve(current, "shell"),
        modulesDir: resolve(current, "modules"),
      };
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error("Could not find pnpm-workspace.yaml. Are you inside a Reactive project?");
    }
    current = parent;
  }
}
