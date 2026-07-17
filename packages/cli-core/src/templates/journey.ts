import { RUNTIME_VERSIONS } from "../runtime-versions.js";
import type { CliPreset, JourneyTemplateParams } from "../preset.js";

export type { JourneyTemplateModule, JourneyTemplateParams } from "../preset.js";

export function journeyPackageJson(params: JourneyTemplateParams, preset: CliPreset): string {
  const moduleDeps = Object.fromEntries(
    params.modules.map((m) => [m.packageName, "workspace:*" as string]),
  );

  return JSON.stringify(
    {
      name: `${params.scope}/${params.journeyName}-journey`,
      version: "0.1.0",
      type: "module",
      main: "./src/index.ts",
      types: "./src/index.ts",
      exports: {
        ".": {
          import: "./src/index.ts",
          types: "./src/index.ts",
        },
      },
      scripts: {
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        [preset.packages.journeys]: RUNTIME_VERSIONS.journeys,
        [`${params.scope}/app-shared`]: "workspace:*",
        ...moduleDeps,
      },
      devDependencies: {
        typescript: "^6.0.2",
      },
    },
    null,
    2,
  );
}

export function journeyTsconfig(): string {
  return JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      include: ["src"],
    },
    null,
    2,
  );
}

export function journeyIndex(params: JourneyTemplateParams): string {
  const journeyExport = `${params.journeyCamel}Journey`;
  const handleExport = `${params.journeyCamel}Handle`;
  const inputType = `${params.journeyPascal}Input`;
  const stateType = `${params.journeyPascal}State`;
  const handleType = `${params.journeyPascal}Handle`;

  return `export {
  ${journeyExport},
  ${handleExport},
  type ${inputType},
  type ${stateType},
  type ${handleType},
} from './${params.journeyName}.js'
`;
}
