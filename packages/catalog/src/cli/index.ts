#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { buildCommand } from "./build-command.js";
import { getPackageVersion } from "./package-version.js";
import { serveCommand } from "./serve-command.js";

const main = defineCommand({
  meta: {
    name: "modular-react-catalog",
    description: "Build a deployable static catalog UI for modular-react modules and journeys.",
    version: getPackageVersion(),
  },
  subCommands: {
    build: buildCommand,
    serve: serveCommand,
  },
});

runMain(main);
