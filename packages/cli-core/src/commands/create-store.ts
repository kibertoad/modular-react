import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "pathe";
import type { CliPreset } from "../preset.js";
import { toCamelCase, toPascalCase } from "../naming.js";
import { resolveProject } from "../utils/resolve-project.js";
import { detectScope } from "../utils/detect-scope.js";
import { addStoreToAppShared, addStoreToMain } from "../utils/transform.js";
import { storeFile } from "../templates/store.js";

export function createCreateStoreCommand(_preset: CliPreset) {
  return defineCommand({
    meta: {
      name: "store",
      description: "Create a new Zustand store and wire it into AppDependencies",
    },
    args: {
      name: {
        type: "positional",
        description: "Store name (e.g. notifications)",
        required: false,
      },
    },
    async run({ args }) {
      const project = resolveProject();
      const scope = detectScope(project.root);

      const isNonInteractive = Boolean(args.name);

      if (!isNonInteractive) {
        p.intro("Create a new store");
      }

      const name =
        args.name ||
        ((await p.text({
          message: "Store name",
          placeholder: "notifications",
          validate: (v) => (!v ? "Required" : undefined),
        })) as string);
      cancelOnExit(name);

      const storePath = resolve(project.shellDir, "src", "stores", `${name}.ts`);
      if (existsSync(storePath)) {
        const msg = `Store "${name}" already exists at ${storePath}`;
        if (isNonInteractive) {
          console.error(msg);
          process.exit(1);
        }
        p.cancel(msg);
        process.exit(1);
      }

      const interfaceName = toPascalCase(name) + "Store";
      const exportName = toCamelCase(name) + "Store";

      writeFileSync(storePath, storeFile({ scope, interfaceName, exportName }));
      addStoreToAppShared(project.appSharedDir, { storeName: name, interfaceName });
      addStoreToMain(project.shellDir, { storeName: name, importName: exportName });

      if (!isNonInteractive) {
        p.note(
          [
            `Store file:  shell/src/stores/${name}.ts`,
            `Interface:   ${interfaceName} (in app-shared)`,
            `Dependency:  AppDependencies.${name}`,
            "",
            "Next: add state and actions to the interface and store.",
          ].join("\n"),
          "Created",
        );
        p.outro("Done!");
      } else {
        console.log(`Store "${name}" created at shell/src/stores/${name}.ts`);
      }
    },
  });
}

function cancelOnExit(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel("Cancelled");
    process.exit(0);
  }
}
