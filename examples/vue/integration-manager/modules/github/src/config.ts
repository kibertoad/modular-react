import type { IntegrationConfig } from "@example-vue-integration-manager/app-shared";

export const githubConfig: IntegrationConfig = {
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
