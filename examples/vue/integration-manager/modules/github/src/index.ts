import { defineModule } from "@modular-vue/core";
import type { RouteRecordRaw } from "vue-router";
import type { AppDependencies, AppSlots } from "@example-vue-integration-manager/app-shared";
import GithubPage from "./GithubPage.vue";
import { githubConfig } from "./config.js";

export default defineModule<AppDependencies, AppSlots>({
  id: "github",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (): RouteRecordRaw => ({
    path: "integrations/github",
    component: GithubPage,
    meta: {
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
