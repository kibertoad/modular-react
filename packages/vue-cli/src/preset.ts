import { createRequire } from "node:module";
import type { CliPreset } from "@modular-react/cli-core";
import { appSharedIndex } from "./templates/app-shared.js";
import {
  shellMain,
  shellRootLayout,
  shellShellLayout,
  shellSidebar,
  shellViteConfig,
  shellIndexHtml,
  shellAuthStore,
  shellConfigStore,
  shellHome,
} from "./templates/shell.js";
import {
  moduleDescriptor,
  moduleDetailPanel,
  moduleListPage,
  modulePage,
  moduleTest,
} from "./templates/module.js";
import { storeFile } from "./templates/store.js";
import { journeyDefinition, journeyPersistence } from "./templates/journey.js";
import {
  appSharedPackageJson,
  appSharedTsconfig,
  journeyPackageJson,
  journeyTsconfig,
  moduleTsconfig,
  modulePackageJson,
  rootPackageJson,
  rootVitestConfig,
  shellPackageJson,
  shellTsconfig,
  tsconfigBase,
} from "./templates/scaffold.js";

const ROUTER_VERSION = "^4.5.0";

// Source the CLI version from this package's own `package.json` so
// `--version` stays in sync with the published package across releases.
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const vuePreset: CliPreset = {
  cliName: "modular-vue",
  cliVersion: pkg.version,
  cliDescription: "modular-react CLI (Vue 3 + vue-router integration)",
  packages: {
    core: "@modular-vue/core",
    runtime: "@modular-vue/runtime",
    testing: "@modular-vue/testing",
    journeys: "@modular-vue/journeys",
    router: "vue-router",
    routerVersion: ROUTER_VERSION,
  },
  docs: {
    shellPatterns: "shell-patterns-vue-router.md",
  },
  scaffold: {
    entryMain: "main.ts",
    viewExt: "vue",
    // Vue-family package.json / tsconfig bodies. When these are present,
    // `cli-core` emits them instead of its React defaults.
    rootPackageJson,
    rootVitestConfig,
    tsconfigBase,
    modulePackageJson,
    moduleTsconfig,
    shellPackageJson,
    shellTsconfig,
    appSharedPackageJson,
    appSharedTsconfig,
    journeyPackageJson,
    journeyTsconfig,
  },
  templates: {
    appSharedIndex,
    shellMain,
    shellRootLayout,
    shellShellLayout,
    shellSidebar,
    shellViteConfig,
    shellIndexHtml,
    shellAuthStore,
    shellConfigStore,
    shellHome,
    moduleDescriptor,
    modulePage,
    moduleListPage,
    moduleDetailPanel,
    moduleTest,
    storeFile,
    journeyDefinition,
    journeyPersistence,
  },
};
