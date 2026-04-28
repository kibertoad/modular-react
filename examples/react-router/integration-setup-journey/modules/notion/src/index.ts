import { defineSlots } from "@modular-react/core";
import type {
  AppDependencies,
  AppSlots,
  IntegrationOption,
} from "@example-rr-integration-setup/app-shared";

const integrationContribution = [
  {
    id: "notion",
    label: "Notion",
    description: "Workspace docs API — also routed through the generic form.",
  },
] as const satisfies readonly IntegrationOption[];

/**
 * Second headless slot-only entry. Two such modules are registered (this
 * + contentful) so the e2e tests can exercise the fallback dispatch
 * path with two distinct kinds, proving the journey treats them
 * uniformly.
 */
export default defineSlots<AppDependencies, AppSlots>("notion", {
  integrations: integrationContribution,
});
