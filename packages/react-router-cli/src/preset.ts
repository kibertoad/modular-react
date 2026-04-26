import { createRequire } from "node:module";
import type { CliPreset } from "@modular-react/cli-core";
import { appSharedIndex } from "./templates/app-shared.js";
import { shellMain, shellRootLayout, shellShellLayout, shellSidebar } from "./templates/shell.js";
import {
  moduleDescriptor,
  moduleDetailPanel,
  moduleListPage,
  modulePage,
  moduleTest,
} from "./templates/module.js";

const ROUTER_VERSION = "^7.6.0";

// Source the CLI version from this package's own `package.json` so
// `--version` stays in sync with the published package across releases.
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const reactRouterPreset: CliPreset = {
  cliName: "react-router-modules",
  cliVersion: pkg.version,
  cliDescription: "modular-react CLI (React Router integration)",
  packages: {
    core: "@react-router-modules/core",
    runtime: "@react-router-modules/runtime",
    testing: "@react-router-modules/testing",
    router: "react-router",
    routerVersion: ROUTER_VERSION,
  },
  docs: {
    shellPatterns: "shell-patterns-react-router.md",
  },
  templates: {
    appSharedIndex,
    shellMain,
    shellRootLayout,
    shellShellLayout,
    shellSidebar,
    shellViteDedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-router",
      "@tanstack/react-query",
      "zustand",
    ],
    moduleDescriptor,
    modulePage,
    moduleListPage,
    moduleDetailPanel,
    moduleTest,
  },
};
