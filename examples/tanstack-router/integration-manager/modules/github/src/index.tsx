import { defineModule } from "@tanstack-react-modules/core";
import { createRoute } from "@tanstack/react-router";
import {
  IntegrationManager,
  type AppDependencies,
  type AppSlots,
  type IntegrationConfig,
} from "@example-tsr-integration-manager/app-shared";

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

export default defineModule<AppDependencies, AppSlots>({
  id: "github",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (parentRoute) =>
    createRoute({
      getParentRoute: () => parentRoute,
      path: "integrations/github",
      component: () => <IntegrationManager config={githubConfig} />,
      staticData: {
        integration: githubConfig,
        pageTitle: "GitHub",
      },
    }),

  navigation: [
    {
      label: "GitHub",
      to: "/integrations/github",
      group: "integrations",
      order: 30,
    },
  ],
});
