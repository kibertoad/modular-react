import { defineModule } from "@tanstack-react-modules/core";
import { createRoute } from "@tanstack/react-router";
import {
  IntegrationManager,
  type AppDependencies,
  type AppSlots,
  type IntegrationConfig,
} from "@example-tsr-integration-manager/app-shared";

const strapiConfig: IntegrationConfig = {
  id: "strapi",
  displayName: "Strapi",
  features: {
    limitImportToOnlyBaseLanguage: true,
    maxBatchSize: 50,
    supportedImportTags: [{ id: "collection_type", title: "Collection type" }],
  },
  columns: [
    { id: "type", title: "Collection / Single", type: "string" },
    { id: "updatedAt", title: "Last updated", type: "date" },
  ],
};

export default defineModule<AppDependencies, AppSlots>({
  id: "strapi",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (parentRoute) =>
    createRoute({
      getParentRoute: () => parentRoute,
      path: "integrations/strapi",
      component: () => <IntegrationManager config={strapiConfig} />,
      staticData: {
        integration: strapiConfig,
        pageTitle: "Strapi",
      },
    }),

  navigation: [
    {
      label: "Strapi",
      to: "/integrations/strapi",
      group: "integrations",
      order: 20,
    },
  ],
});
