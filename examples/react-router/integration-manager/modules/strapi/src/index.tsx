import { defineModule } from "@react-router-modules/core";
import type { RouteObject } from "react-router";
import {
  IntegrationManager,
  type AppDependencies,
  type AppRouteData,
  type AppSlots,
  type IntegrationConfig,
} from "@example-rr-integration-manager/app-shared";

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

const handle = {
  integration: strapiConfig,
  pageTitle: "Strapi",
} satisfies AppRouteData;

export default defineModule<AppDependencies, AppSlots>({
  id: "strapi",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (): RouteObject[] => [
    {
      path: "integrations/strapi",
      Component: () => <IntegrationManager config={strapiConfig} />,
      handle,
    },
  ],

  navigation: [
    {
      label: "Strapi",
      to: "/integrations/strapi",
      group: "integrations",
      order: 20,
    },
  ],
});
