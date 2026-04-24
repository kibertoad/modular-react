import { defineModule } from "@react-router-modules/core";
import type { RouteObject } from "react-router";
import {
  IntegrationManager,
  type AppDependencies,
  type AppRouteData,
  type AppSlots,
  type IntegrationConfig,
} from "@example-rr-integration-manager/app-shared";

const contentfulConfig: IntegrationConfig = {
  id: "contentful",
  displayName: "Contentful",
  features: {
    allowAssigningLanguagesToFolders: true,
    showSkipEmptyOptionOnImport: true,
    supportedImportTags: [
      { id: "entry_title", title: "Entry title" },
      { id: "content_type", title: "Content type" },
      { id: "space_name", title: "Space name" },
    ],
  },
  columns: [
    { id: "type", title: "Content type", type: "string" },
    { id: "updatedAt", title: "Last updated", type: "date" },
  ],
};

const handle = {
  integration: contentfulConfig,
  pageTitle: "Contentful",
} satisfies AppRouteData;

export default defineModule<AppDependencies, AppSlots>({
  id: "contentful",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (): RouteObject[] => [
    {
      path: "integrations/contentful",
      Component: () => <IntegrationManager config={contentfulConfig} />,
      handle,
    },
  ],

  navigation: [
    {
      label: "Contentful",
      to: "/integrations/contentful",
      group: "integrations",
      order: 10,
    },
  ],
});
