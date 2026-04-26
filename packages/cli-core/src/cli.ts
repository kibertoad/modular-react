import { defineCommand, runMain } from "citty";
import type { CliPreset } from "./preset.js";
import { createInitCommand } from "./commands/init.js";
import { createCreateModuleCommand } from "./commands/create-module.js";
import { createCreateStoreCommand } from "./commands/create-store.js";
import { createCreateJourneyCommand } from "./commands/create-journey.js";

/**
 * Build the top-level command tree for a router-specific CLI from a
 * preset. The returned command can be passed straight to `citty.runMain`.
 */
export function buildCli(preset: CliPreset) {
  const create = defineCommand({
    meta: {
      name: "create",
      description: "Create a new module, store, or journey",
    },
    subCommands: {
      module: createCreateModuleCommand(preset),
      store: createCreateStoreCommand(preset),
      journey: createCreateJourneyCommand(preset),
    },
  });

  return defineCommand({
    meta: {
      name: preset.cliName,
      version: preset.cliVersion,
      description: preset.cliDescription,
    },
    subCommands: {
      init: createInitCommand(preset),
      create,
    },
  });
}

/**
 * Convenience for `react-router-cli` / `tanstack-router-cli`'s `cli.ts`.
 * Equivalent to `runMain(buildCli(preset))`.
 */
export function runCli(preset: CliPreset): void {
  runMain(buildCli(preset));
}
