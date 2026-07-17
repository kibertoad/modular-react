import { defineModule } from "@modular-vue/core";
import type { RouteRecordRaw } from "vue-router";
import type { AppDependencies, AppSlots } from "@example-vue-integration-manager/app-shared";
import StrapiPage from "./StrapiPage.vue";
import { strapiConfig } from "./config.js";

export default defineModule<AppDependencies, AppSlots>({
  id: "strapi",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (): RouteRecordRaw => ({
    path: "integrations/strapi",
    component: StrapiPage,
    meta: {
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
