import { defineSlots } from "@modular-react/core";
import type {
  AppDependencies,
  AppSlots,
  IntegrationOption,
} from "@example-tsr-integration-setup/app-shared";

const integrationContribution = [
  {
    id: "contentful",
    label: "Contentful",
    description: "Hosted CMS — routes to the generic configure form.",
  },
] as const satisfies readonly IntegrationOption[];

/**
 * Headless slot-only "module" — registers Contentful in the chooser's
 * `integrations` list without owning any UI. The journey routes the
 * `contentful` branch through the generic module's fallback configure
 * step, so a dedicated React component would be redundant here.
 *
 * Demonstrates the cleanest separation: a third-party integration can be
 * surfaced to users with one tiny package and zero rendering code.
 */
export default defineSlots<AppDependencies, AppSlots>("contentful", {
  integrations: integrationContribution,
});
