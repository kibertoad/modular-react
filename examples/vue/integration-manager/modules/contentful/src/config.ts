import type { IntegrationConfig } from "@example-vue-integration-manager/app-shared";

export const contentfulConfig: IntegrationConfig = {
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
