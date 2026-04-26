import type { CliPreset } from "@modular-react/cli-core";
import { appSharedIndex } from "./templates/app-shared.js";
import {
  shellMain,
  shellRootLayout,
  shellShellLayout,
  shellSidebar,
} from "./templates/shell.js";
import {
  moduleDescriptor,
  moduleDetailPanel,
  moduleListPage,
  modulePage,
  moduleTest,
} from "./templates/module.js";

const ROUTER_VERSION = "^1.120.0";

export const tanstackRouterPreset: CliPreset = {
  cliName: "tanstack-react-modules",
  cliVersion: "0.1.0",
  cliDescription: "modular-react CLI (TanStack Router integration)",
  packages: {
    core: "@tanstack-react-modules/core",
    runtime: "@tanstack-react-modules/runtime",
    testing: "@tanstack-react-modules/testing",
    router: "@tanstack/react-router",
    routerVersion: ROUTER_VERSION,
  },
  docs: {
    shellPatterns: "shell-patterns-tanstack-router.md",
  },
  templates: {
    appSharedIndex,
    appSharedExtraDeps: {
      // Required so app-shared can augment `@tanstack/router-core`'s
      // `StaticDataRouteOption` interface with AppZones.
      dependencies: { "@tanstack/router-core": "^1.120.0" },
      devDependencies: { "@tanstack/router-core": "^1.120.0" },
    },
    shellMain,
    shellRootLayout,
    shellShellLayout,
    shellSidebar,
    shellViteDedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-router",
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
