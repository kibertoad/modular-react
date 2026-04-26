import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "pathe";
import type { CliPreset } from "../preset.js";
import { toCamelCase, toPascalCase } from "../naming.js";
import { resolveProject } from "../utils/resolve-project.js";
import { detectScope } from "../utils/detect-scope.js";
import { promptText } from "../utils/prompt.js";
import { addModuleToMain, addModuleToShellPackageJson } from "../utils/transform.js";
import { modulePackageJson, moduleTsconfig } from "../templates/module.js";

export function createCreateModuleCommand(preset: CliPreset) {
  return defineCommand({
    meta: {
      name: "module",
      description: "Create a new module",
    },
    args: {
      name: {
        type: "positional",
        description: "Module name",
        required: false,
      },
      route: {
        type: "string",
        description: "Route path (defaults to module name)",
      },
      "nav-group": {
        type: "string",
        description: "Navigation group",
      },
    },
    async run({ args }) {
      const project = resolveProject();
      const scope = detectScope(project.root);

      const isNonInteractive = Boolean(args.name);

      if (!isNonInteractive) {
        p.intro("Create a new module");
      }

      const name =
        args.name ||
        (await promptText({
          message: "Module name",
          placeholder: "billing",
          validate: (v) => (!v ? "Required" : undefined),
        }));

      const moduleDir = resolve(project.modulesDir, name);
      if (existsSync(moduleDir)) {
        const msg = `Module "${name}" already exists at ${moduleDir}`;
        if (isNonInteractive) {
          console.error(msg);
          process.exit(1);
        }
        p.cancel(msg);
        process.exit(1);
      }

      const route =
        args.route ||
        (isNonInteractive
          ? name
          : await promptText({
              message: "Route path",
              defaultValue: name,
              placeholder: name,
            }));

      const navGroupRaw = args["nav-group"]
        ? args["nav-group"]
        : isNonInteractive
          ? ""
          : await promptText({
              message: "Navigation group (optional)",
              placeholder: "leave empty for none",
            });
      const navGroup = navGroupRaw || undefined;

      const pageName = toPascalCase(name) + "Dashboard";
      const listPageName = toPascalCase(name) + "List";
      const importName = toCamelCase(name);
      const moduleLabel = toPascalCase(name);

      mkdirSync(resolve(moduleDir, "src", "pages"), { recursive: true });
      mkdirSync(resolve(moduleDir, "src", "panels"), { recursive: true });
      mkdirSync(resolve(moduleDir, "src", "__tests__"), { recursive: true });
      writeFileSync(resolve(moduleDir, "package.json"), modulePackageJson({ scope, name, preset }));
      writeFileSync(resolve(moduleDir, "tsconfig.json"), moduleTsconfig());
      writeFileSync(
        resolve(moduleDir, "src", "index.ts"),
        preset.templates.moduleDescriptor({
          scope,
          name,
          route,
          pageName,
          listPageName,
          navGroup,
          moduleLabel,
        }),
      );
      writeFileSync(
        resolve(moduleDir, "src", "pages", `${pageName}.tsx`),
        preset.templates.modulePage({ scope, pageName, moduleLabel, moduleName: name }),
      );
      writeFileSync(
        resolve(moduleDir, "src", "pages", `${listPageName}.tsx`),
        preset.templates.moduleListPage({ scope, pageName: listPageName, moduleLabel }),
      );
      writeFileSync(
        resolve(moduleDir, "src", "panels", "DetailPanel.tsx"),
        preset.templates.moduleDetailPanel({ moduleLabel }),
      );
      writeFileSync(
        resolve(moduleDir, "src", "__tests__", `${name}.test.ts`),
        preset.templates.moduleTest({ scope, name, importName, route, pageName, moduleLabel }),
      );

      addModuleToShellPackageJson(project.shellDir, { scope, moduleName: name });
      addModuleToMain(project.shellDir, { scope, moduleName: name, importName });

      if (!isNonInteractive) {
        p.note(
          [
            `Module:  modules/${name}/`,
            `Package: ${scope}/${name}-module`,
            `Route:   /${route}`,
            "",
            "Run pnpm install to link the new package.",
          ].join("\n"),
          "Created",
        );
        p.outro("Done!");
      } else {
        console.log(`Module "${name}" created at modules/${name}/`);
      }
    },
  });
}

