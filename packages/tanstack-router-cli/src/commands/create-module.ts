import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "pathe";
import { resolveProject } from "../utils/resolve-project.js";
import { detectScope } from "../utils/detect-scope.js";
import { addModuleToMain, addModuleToShellPackageJson } from "../utils/transform.js";
import {
  modulePackageJson,
  moduleTsconfig,
  moduleDescriptor,
  modulePage,
  moduleListPage,
  moduleDetailPanel,
  moduleTest,
} from "../templates/module.js";

export default defineCommand({
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
      ((await p.text({
        message: "Module name",
        placeholder: "billing",
        validate: (v) => (!v ? "Required" : undefined),
      })) as string);

    if (p.isCancel(name)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

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
        : ((await p.text({
            message: "Route path",
            defaultValue: name,
            placeholder: name,
          })) as string));

    if (p.isCancel(route)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    const navGroup =
      args["nav-group"] ||
      (isNonInteractive
        ? undefined
        : ((await p.text({
            message: "Navigation group (optional)",
            placeholder: "leave empty for none",
          })) as string)) ||
      undefined;

    if (p.isCancel(navGroup)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    const pageName = toPascalCase(name) + "Dashboard";
    const listPageName = toPascalCase(name) + "List";
    const importName = toCamelCase(name);

    // Scaffold module directory
    const moduleLabel = toPascalCase(name);
    mkdirSync(resolve(moduleDir, "src", "pages"), { recursive: true });
    mkdirSync(resolve(moduleDir, "src", "panels"), { recursive: true });
    mkdirSync(resolve(moduleDir, "src", "__tests__"), { recursive: true });
    writeFileSync(resolve(moduleDir, "package.json"), modulePackageJson({ scope, name }));
    writeFileSync(resolve(moduleDir, "tsconfig.json"), moduleTsconfig());
    writeFileSync(
      resolve(moduleDir, "src", "index.ts"),
      moduleDescriptor({ scope, name, route, pageName, listPageName, navGroup }),
    );
    writeFileSync(
      resolve(moduleDir, "src", "pages", `${pageName}.tsx`),
      modulePage({ scope, pageName, moduleLabel, moduleName: name }),
    );
    writeFileSync(
      resolve(moduleDir, "src", "pages", `${listPageName}.tsx`),
      moduleListPage({ scope, pageName: listPageName, moduleLabel }),
    );
    writeFileSync(
      resolve(moduleDir, "src", "panels", "DetailPanel.tsx"),
      moduleDetailPanel({ moduleLabel }),
    );
    writeFileSync(
      resolve(moduleDir, "src", "__tests__", `${name}.test.ts`),
      moduleTest({ scope, name, importName, route, pageName }),
    );

    // Wire into shell
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

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
