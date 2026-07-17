import type { IntegrationConfig } from "@example-vue-integration-manager/app-shared";

export const strapiConfig: IntegrationConfig = {
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
