import { defineModule } from "@tanstack-react-modules/core";
import { createRoute } from "@tanstack/react-router";
import {
  IntegrationManager,
  type AppDependencies,
  type AppSlots,
  type IntegrationConfig,
} from "@example-tsr-integration-manager/app-shared";

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

export default defineModule<AppDependencies, AppSlots>({
  id: "contentful",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (parentRoute) =>
    createRoute({
      getParentRoute: () => parentRoute,
      path: "integrations/contentful",
      component: () => <IntegrationManager config={contentfulConfig} />,
      staticData: {
        integration: contentfulConfig,
        pageTitle: "Contentful",
      },
    }),

  navigation: [
    {
      label: "Contentful",
      to: "/integrations/contentful",
      group: "integrations",
      order: 10,
    },
  ],
});
