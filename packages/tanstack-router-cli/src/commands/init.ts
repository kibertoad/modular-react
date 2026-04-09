import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "pathe";
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
  appSharedIndex,
  appSharedTypes,
} from "../templates/app-shared.js";
import {
  shellPackageJson,
  shellTsconfig,
  shellViteConfig,
  shellIndexHtml,
  shellMain,
  shellAuthStore,
  shellConfigStore,
  shellHttpClient,
  shellRootLayout,
  shellShellLayout,
  shellSidebar,
  shellHome,
} from "../templates/shell.js";
import {
  modulePackageJson,
  moduleTsconfig,
  moduleDescriptor,
  modulePage,
  moduleListPage,
  moduleDetailPanel,
} from "../templates/module.js";

export default defineCommand({
  meta: {
    name: "init",
    description: "Create a new Reactive project",
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
      p.intro("Create a new Reactive project");
    }

    const projectName =
      args.name ||
      ((await p.text({
        message: "Project name",
        placeholder: "my-app",
        validate: (v) => (!v ? "Required" : undefined),
      })) as string);

    if (p.isCancel(projectName)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

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

    if (p.isCancel(scope)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    const moduleName =
      args.module ||
      ((await p.text({
        message: "First module name",
        placeholder: "dashboard",
        validate: (v) => (!v ? "Required" : undefined),
      })) as string);

    if (p.isCancel(moduleName)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    const root = resolve(process.cwd(), projectName);
    const pageName = toPascalCase(moduleName) + "Dashboard";
    const listPageName = toPascalCase(moduleName) + "List";
    const importName = toCamelCase(moduleName);

    if (!isNonInteractive) {
      const s = p.spinner();
      s.start("Scaffolding project...");
      scaffold(root, projectName, scope, moduleName, pageName, listPageName, importName);
      s.stop("Project created!");
      p.note(`cd ${projectName}\npnpm install\npnpm dev`, "Next steps");
      p.outro("Happy building!");
    } else {
      scaffold(root, projectName, scope, moduleName, pageName, listPageName, importName);
      console.log(`Project created at ${root}`);
    }
  },
});

function scaffold(
  root: string,
  projectName: string,
  scope: string,
  moduleName: string,
  pageName: string,
  listPageName: string,
  importName: string,
): void {
  // Root files
  mkdirSync(root, { recursive: true });
  writeFileSync(resolve(root, "package.json"), rootPackageJson({ name: projectName }));
  writeFileSync(resolve(root, "pnpm-workspace.yaml"), pnpmWorkspace());
  writeFileSync(resolve(root, "tsconfig.base.json"), tsconfigBase());
  writeFileSync(resolve(root, "tsconfig.json"), tsconfigRoot());
  writeFileSync(resolve(root, ".gitignore"), gitignore());

  // app-shared
  mkdirSync(resolve(root, "app-shared", "src", "contracts"), { recursive: true });
  writeFileSync(resolve(root, "app-shared", "package.json"), appSharedPackageJson({ scope }));
  writeFileSync(resolve(root, "app-shared", "tsconfig.json"), appSharedTsconfig());
  writeFileSync(resolve(root, "app-shared", "src", "index.ts"), appSharedIndex({ scope }));
  writeFileSync(resolve(root, "app-shared", "src", "types.ts"), appSharedTypes());

  // shell
  mkdirSync(resolve(root, "shell", "src", "stores"), { recursive: true });
  mkdirSync(resolve(root, "shell", "src", "services"), { recursive: true });
  mkdirSync(resolve(root, "shell", "src", "components"), { recursive: true });
  writeFileSync(resolve(root, "shell", "package.json"), shellPackageJson({ scope, moduleName }));
  writeFileSync(resolve(root, "shell", "tsconfig.json"), shellTsconfig());
  writeFileSync(resolve(root, "shell", "vite.config.ts"), shellViteConfig());
  writeFileSync(resolve(root, "shell", "index.html"), shellIndexHtml({ projectName }));
  writeFileSync(
    resolve(root, "shell", "src", "main.tsx"),
    shellMain({ scope, moduleName, importName }),
  );
  writeFileSync(resolve(root, "shell", "src", "stores", "auth.ts"), shellAuthStore({ scope }));
  writeFileSync(
    resolve(root, "shell", "src", "stores", "config.ts"),
    shellConfigStore({ scope, appName: projectName }),
  );
  writeFileSync(resolve(root, "shell", "src", "services", "http-client.ts"), shellHttpClient());
  writeFileSync(
    resolve(root, "shell", "src", "components", "RootLayout.tsx"),
    shellRootLayout(),
  );
  writeFileSync(
    resolve(root, "shell", "src", "components", "ShellLayout.tsx"),
    shellShellLayout({ scope }),
  );
  writeFileSync(
    resolve(root, "shell", "src", "components", "Sidebar.tsx"),
    shellSidebar({ projectName }),
  );
  writeFileSync(resolve(root, "shell", "src", "components", "Home.tsx"), shellHome({ scope }));

  // First module (with two routes for testable routing)
  const moduleDir = resolve(root, "modules", moduleName);
  const moduleLabel = toPascalCase(moduleName);
  mkdirSync(resolve(moduleDir, "src", "pages"), { recursive: true });
  mkdirSync(resolve(moduleDir, "src", "panels"), { recursive: true });
  writeFileSync(resolve(moduleDir, "package.json"), modulePackageJson({ scope, name: moduleName }));
  writeFileSync(resolve(moduleDir, "tsconfig.json"), moduleTsconfig());
  writeFileSync(
    resolve(moduleDir, "src", "index.ts"),
    moduleDescriptor({ scope, name: moduleName, route: moduleName, pageName, listPageName }),
  );
  writeFileSync(
    resolve(moduleDir, "src", "pages", `${pageName}.tsx`),
    modulePage({ scope, pageName, moduleLabel, moduleName }),
  );
  writeFileSync(
    resolve(moduleDir, "src", "pages", `${listPageName}.tsx`),
    moduleListPage({ scope, pageName: listPageName, moduleLabel }),
  );
  writeFileSync(
    resolve(moduleDir, "src", "panels", "DetailPanel.tsx"),
    moduleDetailPanel({ moduleLabel }),
  );
}

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
