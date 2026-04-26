import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "pathe";
import type { CliPreset } from "../preset.js";
import { toCamelCase, toPascalCase } from "../naming.js";
import {
  rootPackageJson,
  pnpmWorkspace,
  tsconfigBase,
  tsconfigRoot,
  gitignore,
} from "../templates/workspace.js";
import {
  appSharedPackageJson,
  appSharedTsconfig,
  appSharedTypes,
} from "../templates/app-shared.js";
import {
  shellPackageJson,
  shellTsconfig,
  shellViteConfig,
  shellIndexHtml,
  shellAuthStore,
  shellConfigStore,
  shellHttpClient,
  shellHome,
} from "../templates/shell.js";
import { modulePackageJson, moduleTsconfig } from "../templates/module.js";

export function createInitCommand(preset: CliPreset) {
  return defineCommand({
    meta: {
      name: "init",
      description: "Create a new modular-react project",
    },
    args: {
      name: {
        type: "positional",
        description: "Project name",
        required: false,
      },
      scope: {
        type: "string",
        description: "Package scope (e.g. @myapp)",
      },
      module: {
        type: "string",
        description: "First module name (e.g. dashboard)",
      },
    },
    async run({ args }) {
      const isNonInteractive = Boolean(args.scope && args.module);

      if (!isNonInteractive) {
        p.intro("Create a new modular-react project");
      }

      const projectName =
        args.name ||
        ((await p.text({
          message: "Project name",
          placeholder: "my-app",
          validate: (v) => (!v ? "Required" : undefined),
        })) as string);
      cancelOnExit(projectName);

      const scope =
        args.scope ||
        ((await p.text({
          message: "Package scope",
          placeholder: "@myapp",
          validate: (v) => {
            if (!v || !v.startsWith("@")) return "Scope must start with @";
            if (v.length < 2) return "Scope too short";
            return undefined;
          },
        })) as string);
      cancelOnExit(scope);

      const moduleName =
        args.module ||
        ((await p.text({
          message: "First module name",
          placeholder: "dashboard",
          validate: (v) => (!v ? "Required" : undefined),
        })) as string);
      cancelOnExit(moduleName);

      const root = resolve(process.cwd(), projectName);
      const pageName = toPascalCase(moduleName) + "Dashboard";
      const listPageName = toPascalCase(moduleName) + "List";
      const importName = toCamelCase(moduleName);

      const work = () =>
        scaffold({
          preset,
          root,
          projectName,
          scope,
          moduleName,
          pageName,
          listPageName,
          importName,
        });

      if (!isNonInteractive) {
        const s = p.spinner();
        s.start("Scaffolding project...");
        work();
        s.stop("Project created!");
        p.note(`cd ${projectName}\npnpm install\npnpm dev`, "Next steps");
        p.outro("Happy building!");
      } else {
        work();
        console.log(`Project created at ${root}`);
      }
    },
  });
}

function scaffold(args: {
  preset: CliPreset;
  root: string;
  projectName: string;
  scope: string;
  moduleName: string;
  pageName: string;
  listPageName: string;
  importName: string;
}): void {
  const { preset, root, projectName, scope, moduleName, pageName, listPageName, importName } =
    args;
  const moduleLabel = toPascalCase(moduleName);

  // Root files
  mkdirSync(root, { recursive: true });
  writeFileSync(resolve(root, "package.json"), rootPackageJson({ name: projectName }));
  writeFileSync(resolve(root, "pnpm-workspace.yaml"), pnpmWorkspace());
  writeFileSync(resolve(root, "tsconfig.base.json"), tsconfigBase());
  writeFileSync(resolve(root, "tsconfig.json"), tsconfigRoot());
  writeFileSync(resolve(root, ".gitignore"), gitignore());

  // app-shared
  mkdirSync(resolve(root, "app-shared", "src", "contracts"), { recursive: true });
  writeFileSync(
    resolve(root, "app-shared", "package.json"),
    appSharedPackageJson({ scope, preset }),
  );
  writeFileSync(resolve(root, "app-shared", "tsconfig.json"), appSharedTsconfig());
  writeFileSync(
    resolve(root, "app-shared", "src", "index.ts"),
    preset.templates.appSharedIndex({ scope }),
  );
  writeFileSync(resolve(root, "app-shared", "src", "types.ts"), appSharedTypes());

  // shell
  mkdirSync(resolve(root, "shell", "src", "stores"), { recursive: true });
  mkdirSync(resolve(root, "shell", "src", "services"), { recursive: true });
  mkdirSync(resolve(root, "shell", "src", "components"), { recursive: true });
  writeFileSync(
    resolve(root, "shell", "package.json"),
    shellPackageJson({ scope, moduleName, preset }),
  );
  writeFileSync(resolve(root, "shell", "tsconfig.json"), shellTsconfig());
  writeFileSync(resolve(root, "shell", "vite.config.ts"), shellViteConfig({ preset }));
  writeFileSync(resolve(root, "shell", "index.html"), shellIndexHtml({ projectName }));
  writeFileSync(
    resolve(root, "shell", "src", "main.tsx"),
    preset.templates.shellMain({
      scope,
      moduleName,
      importName,
      docsLink: docsUrl(preset.docs.shellPatterns),
    }),
  );
  writeFileSync(resolve(root, "shell", "src", "stores", "auth.ts"), shellAuthStore({ scope }));
  writeFileSync(
    resolve(root, "shell", "src", "stores", "config.ts"),
    shellConfigStore({ scope, appName: projectName }),
  );
  writeFileSync(resolve(root, "shell", "src", "services", "http-client.ts"), shellHttpClient());
  writeFileSync(
    resolve(root, "shell", "src", "components", "RootLayout.tsx"),
    preset.templates.shellRootLayout(),
  );
  writeFileSync(
    resolve(root, "shell", "src", "components", "ShellLayout.tsx"),
    preset.templates.shellShellLayout({ scope }),
  );
  writeFileSync(
    resolve(root, "shell", "src", "components", "Sidebar.tsx"),
    preset.templates.shellSidebar({ projectName }),
  );
  writeFileSync(resolve(root, "shell", "src", "components", "Home.tsx"), shellHome({ scope }));

  // First module (with two routes for testable routing)
  const moduleDir = resolve(root, "modules", moduleName);
  mkdirSync(resolve(moduleDir, "src", "pages"), { recursive: true });
  mkdirSync(resolve(moduleDir, "src", "panels"), { recursive: true });
  writeFileSync(
    resolve(moduleDir, "package.json"),
    modulePackageJson({ scope, name: moduleName, preset }),
  );
  writeFileSync(resolve(moduleDir, "tsconfig.json"), moduleTsconfig());
  writeFileSync(
    resolve(moduleDir, "src", "index.ts"),
    preset.templates.moduleDescriptor({
      scope,
      name: moduleName,
      route: moduleName,
      pageName,
      listPageName,
    }),
  );
  writeFileSync(
    resolve(moduleDir, "src", "pages", `${pageName}.tsx`),
    preset.templates.modulePage({ scope, pageName, moduleLabel, moduleName }),
  );
  writeFileSync(
    resolve(moduleDir, "src", "pages", `${listPageName}.tsx`),
    preset.templates.moduleListPage({ scope, pageName: listPageName, moduleLabel }),
  );
  writeFileSync(
    resolve(moduleDir, "src", "panels", "DetailPanel.tsx"),
    preset.templates.moduleDetailPanel({ moduleLabel }),
  );
}

function cancelOnExit(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel("Cancelled");
    process.exit(0);
  }
}

function docsUrl(path: string): string {
  return `https://github.com/kibertoad/modular-react/blob/main/docs/${path}`;
}
