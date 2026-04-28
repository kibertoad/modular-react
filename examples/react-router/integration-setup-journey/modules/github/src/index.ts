import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { IntegrationOption } from "@example-rr-integration-setup/app-shared";
import { githubExits } from "./exits.js";
import { ConfigureGithub, type ConfigureGithubInput } from "./ConfigureGithub.js";

export { githubExits };
export type { GithubExits } from "./exits.js";

// Slot contribution kept in its own const so we can `satisfies` against
// IntegrationOption[] — `satisfies` validates the shape AND preserves the
// literal types (`id: "github"`, not widened to `string`), so the shell's
// `registry.register(...)` typechecks against `AppSlots` even though
// `defineModule` is called without generics.
const integrationContribution = [
  {
    id: "github",
    label: "GitHub",
    description: "Push-based webhooks and repo metadata.",
  },
] as const satisfies readonly IntegrationOption[];

// `defineModule` without generics: see integration-picker/src/index.ts for the rationale.
export default defineModule({
  id: "github",
  version: "1.0.0",
  meta: {
    name: "GitHub",
    description: "Webhooks + repo metadata for the GitHub integration.",
  },
  exitPoints: githubExits,
  entryPoints: {
    configure: defineEntry({
      component: ConfigureGithub,
      input: schema<ConfigureGithubInput>(),
    }),
  },
  // Modules contribute their own row to the chooser. Adding GitHub is a
  // single edit here — nothing in the chooser or the journey needs to know
  // about it ahead of time.
  slots: {
    integrations: integrationContribution,
  },
});
