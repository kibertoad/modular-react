import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "pathe";
import type { CliPreset } from "../preset.js";
import { toCamelCase, toPascalCase } from "../naming.js";
import { resolveProject } from "../utils/resolve-project.js";
import { detectScope } from "../utils/detect-scope.js";
import { promptText } from "../utils/prompt.js";
import {
  addJourneyToMain,
  addJourneyToShellPackageJson,
  ensureJourneysInWorkspace,
} from "../utils/transform.js";
import {
  journeyDefinition,
  journeyIndex,
  journeyPackageJson,
  journeyPersistence,
  journeyTsconfig,
  type JourneyTemplateModule,
} from "../templates/journey.js";

export function createCreateJourneyCommand(_preset: CliPreset) {
  return defineCommand({
    meta: {
      name: "journey",
      description:
        "Scaffold a typed journey package and wire it into the shell's registry (see @modular-react/journeys)",
    },
    args: {
      name: {
        type: "positional",
        description: "Journey name (e.g. customer-onboarding)",
        required: false,
      },
      modules: {
        type: "string",
        description:
          "Comma-separated list of module names this journey composes (e.g. profile,plan,billing)",
      },
      persistence: {
        type: "boolean",
        description:
          "Also generate a webStorage persistence adapter at shell/src/<journey>-persistence.ts",
      },
    },
    async run({ args }) {
      const project = resolveProject();
      const scope = detectScope(project.root);

      const isNonInteractive = Boolean(args.name);

      if (!isNonInteractive) {
        p.intro("Create a new journey");
      }

      const name =
        args.name ||
        (await promptText({
          message: "Journey name",
          placeholder: "customer-onboarding",
          validate: (v) => {
            if (!v) return "Required";
            if (!/^[a-z][a-z0-9-]*$/.test(v))
              return "Use lowercase letters, digits, and dashes only.";
            return undefined;
          },
        }));

      const journeyDir = resolve(project.journeysDir, name);
      if (existsSync(journeyDir)) {
        const msg = `Journey "${name}" already exists at ${journeyDir}`;
        if (isNonInteractive) {
          console.error(msg);
          process.exit(1);
        }
        p.cancel(msg);
        process.exit(1);
      }

      const moduleNames = parseModuleList(args.modules);
      const modules = moduleNames.map((moduleName) =>
        toJourneyModule({ scope, moduleName, project }),
      );
      const missingModules = modules.filter((m) => !m.exists).map((m) => m.moduleName);
      if (missingModules.length > 0) {
        const msg = `Module(s) not found in modules/: ${missingModules.join(", ")}. Create them with \`create module\` first.`;
        if (isNonInteractive) {
          console.error(msg);
          process.exit(1);
        }
        p.cancel(msg);
        process.exit(1);
      }

      const withPersistence = args.persistence === true;
      const journeyPascal = toPascalCase(name);
      const journeyCamel = toCamelCase(name);
      const journeyExportName = `${journeyCamel}Journey`;
      const handleExportName = `${journeyCamel}Handle`;
      const persistenceExportName = `${journeyCamel}Persistence`;

      // 1. Scaffold the journey package.
      mkdirSync(resolve(journeyDir, "src"), { recursive: true });
      writeFileSync(
        resolve(journeyDir, "package.json"),
        journeyPackageJson({
          scope,
          journeyName: name,
          journeyPascal,
          journeyCamel,
          modules,
          withPersistence,
        }),
      );
      writeFileSync(resolve(journeyDir, "tsconfig.json"), journeyTsconfig());
      writeFileSync(
        resolve(journeyDir, "src", "index.ts"),
        journeyIndex({
          scope,
          journeyName: name,
          journeyPascal,
          journeyCamel,
          modules,
          withPersistence,
        }),
      );
      writeFileSync(
        resolve(journeyDir, "src", `${name}.ts`),
        journeyDefinition({
          scope,
          journeyName: name,
          journeyPascal,
          journeyCamel,
          modules,
          withPersistence,
        }),
      );

      // 2. Make sure pnpm-workspace.yaml has `journeys/*` (older projects).
      ensureJourneysInWorkspace(project.root);

      // 3. Add a shell dependency on the journey + the journeys runtime.
      addJourneyToShellPackageJson(project.shellDir, { scope, journeyName: name });

      // 4. Optional persistence adapter under shell/src/. Written before
      //    we wire main.tsx so the import we add is immediately valid.
      if (withPersistence) {
        const persistencePath = resolve(project.shellDir, "src", `${name}-persistence.ts`);
        writeFileSync(
          persistencePath,
          journeyPersistence({
            scope,
            journeyName: name,
            journeyPascal,
            journeyCamel,
            modules,
            withPersistence,
          }),
        );
      }

      // 5. Wire the journey into shell/src/main.tsx (plugin install +
      //    registerJourney). When persistence was generated, the call
      //    becomes `registerJourney(<journey>, { persistence })` and the
      //    binding gets imported from the file we just wrote.
      addJourneyToMain(project.shellDir, {
        scope,
        journeyName: name,
        journeyExportName,
        handleExportName,
        persistenceExportName: withPersistence ? persistenceExportName : undefined,
      });

      const summary = [
        `Journey:    journeys/${name}/`,
        `Package:    ${scope}/${name}-journey`,
        `Handle:     ${handleExportName}  (typed token for runtime.start(handle, input))`,
        `Modules:    ${modules.length === 0 ? "(none — add some via --modules)" : modules.map((m) => m.moduleName).join(", ")}`,
        withPersistence
          ? `Persistence: shell/src/${name}-persistence.ts (wired into registerJourney as { persistence: ${persistenceExportName} })`
          : null,
        "",
        "Next:",
        "  - Fill in initialState, start, and transitions in the journey definition.",
        "  - On each composed module, add entryPoints + exitPoints (defineEntry / defineExit).",
        withPersistence
          ? `  - Tune ${persistenceExportName}.keyFor in shell/src/${name}-persistence.ts to match your input shape.`
          : null,
        "  - Run pnpm install to link the new package.",
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      if (!isNonInteractive) {
        p.note(summary, "Created");
        p.outro("Done!");
      } else {
        console.log(`Journey "${name}" created at journeys/${name}/`);
      }
    },
  });
}

function parseModuleList(value: string | undefined): readonly string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toJourneyModule(args: {
  scope: string;
  moduleName: string;
  project: ReturnType<typeof resolveProject>;
}): JourneyTemplateModule & { exists: boolean } {
  const { scope, moduleName, project } = args;
  const moduleDir = resolve(project.modulesDir, moduleName);
  const pkgPath = resolve(moduleDir, "package.json");
  let packageName = `${scope}/${moduleName}-module`;
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (typeof pkg.name === "string") packageName = pkg.name;
    } catch {
      // Fall back to the conventional name.
    }
  }
  return {
    moduleName,
    importName: toCamelCase(moduleName),
    packageName,
    exists: existsSync(moduleDir),
  };
}

