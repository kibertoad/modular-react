import { defineModule } from "@react-router-modules/core";
import type { RouteObject } from "react-router";
import {
  IntegrationManager,
  type AppDependencies,
  type AppRouteData,
  type AppSlots,
  type IntegrationConfig,
} from "@example-rr-integration-manager/app-shared";

const githubConfig: IntegrationConfig = {
  id: "github",
  displayName: "GitHub",
  features: {
    showSkipEmptyOptionOnImport: false,
    maxBatchSize: 200,
  },
  columns: [
    { id: "path", title: "File path", type: "string" },
    { id: "sha", title: "SHA", type: "string" },
    { id: "updatedAt", title: "Committed", type: "date" },
  ],
};

const handle = {
  integration: githubConfig,
  pageTitle: "GitHub",
} satisfies AppRouteData;

export default defineModule<AppDependencies, AppSlots>({
  id: "github",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (): RouteObject[] => [
    {
      path: "integrations/github",
      Component: () => <IntegrationManager config={githubConfig} />,
      handle,
    },
  ],

  navigation: [
    {
      label: "GitHub",
      to: "/integrations/github",
      group: "integrations",
      order: 30,
    },
  ],
});
