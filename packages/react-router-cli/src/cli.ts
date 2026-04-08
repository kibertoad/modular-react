#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import init from "./commands/init.js";
import createModule from "./commands/create-module.js";
import createStore from "./commands/create-store.js";

const create = defineCommand({
  meta: {
    name: "create",
    description: "Create a new module or store",
  },
  subCommands: {
    module: createModule,
    store: createStore,
  },
});

const main = defineCommand({
  meta: {
    name: "reactive",
    version: "0.1.0",
    description: "Reactive framework CLI",
  },
  subCommands: {
    init,
    create,
  },
});

runMain(main);
