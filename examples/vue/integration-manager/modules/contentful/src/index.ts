import { defineModule } from "@modular-vue/core";
import type { RouteRecordRaw } from "vue-router";
import type { AppDependencies, AppSlots } from "@example-vue-integration-manager/app-shared";
import ContentfulPage from "./ContentfulPage.vue";
import { contentfulConfig } from "./config.js";

export default defineModule<AppDependencies, AppSlots>({
  id: "contentful",
  version: "0.0.0",
  requires: ["auth"],

  createRoutes: (): RouteRecordRaw => ({
    path: "integrations/contentful",
    component: ContentfulPage,
    // `meta` is the vue-router channel the runtime reads via
    // `useRouteData<AppRouteData>()`. It is typed against `AppRouteData`
    // through the `RouteMeta` augmentation in app-shared.
    meta: {
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
