import { RUNTIME_VERSIONS } from "../runtime-versions.js";

export interface JourneyTemplateModule {
  /** The module's name as scaffolded by `create module` (e.g. `billing`). */
  readonly moduleName: string;
  /** The default-import name (e.g. `billing`). */
  readonly importName: string;
  /** The package name (e.g. `@myorg/billing-module`). */
  readonly packageName: string;
}

export interface JourneyTemplateParams {
  readonly scope: string;
  /** Kebab-case journey id (e.g. `customer-onboarding`). */
  readonly journeyName: string;
  /** PascalCase journey base (e.g. `CustomerOnboarding`). */
  readonly journeyPascal: string;
  /** camelCase journey base (e.g. `customerOnboarding`). */
  readonly journeyCamel: string;
  readonly modules: readonly JourneyTemplateModule[];
  readonly withPersistence: boolean;
}

export function journeyPackageJson(params: JourneyTemplateParams): string {
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
        "@modular-react/journeys": RUNTIME_VERSIONS.journeys,
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

export function journeyDefinition(params: JourneyTemplateParams): string {
  const journeyExport = `${params.journeyCamel}Journey`;
  const handleExport = `${params.journeyCamel}Handle`;
  const inputType = `${params.journeyPascal}Input`;
  const stateType = `${params.journeyPascal}State`;
  const handleType = `${params.journeyPascal}Handle`;
  const modulesType = `${params.journeyPascal}Modules`;

  // Build the modules type-map. Always type-only — journeys don't pull
  // module bundles into their package.
  const moduleImports = params.modules
    .map((m) => `import type ${m.importName}Module from '${m.packageName}'`)
    .join("\n");

  const modulesEntries = params.modules
    .map((m) => `  readonly ${m.importName}: typeof ${m.importName}Module;`)
    .join("\n");

  // Pick the first listed module as the journey's `start` step. If the
  // user didn't list any (the default), emit a hand-fillable stub the
  // typechecker will flag once they wire up real entries.
  const firstModule = params.modules[0];
  const startBlock = firstModule
    ? `  start: (state) => ({
    module: '${firstModule.importName}',
    // TODO: pick an entry name your ${firstModule.importName} module exposes via entryPoints.
    entry: 'TODO_entry_name' as const,
    input: state,
  }),`
    : `  start: (_state) => {
    // TODO: return the first step to enter, e.g.:
    //   return { module: 'profile', entry: 'review', input: { customerId: state.customerId } }
    throw new Error('Define the start step for ${params.journeyName} journey.')
  },`;

  const transitionsBlock = firstModule
    ? `  transitions: {
    ${firstModule.importName}: {
      // TODO: list each entry name you handle and one branch per exit it can emit.
      // Example shape:
      //   <entry>: {
      //     <exitName>: ({ output, state }) => ({ complete: { ... } }),
      //     cancelled: () => ({ abort: { reason: 'cancelled' } }),
      //   }
    },
  },`
    : `  transitions: {
    // TODO: per-module transition map. Each key is a module from ${modulesType}; the
    // value lists entries you handle and the exits each entry can emit.
  },`;

  return `import { defineJourney, defineJourneyHandle } from '@modular-react/journeys'
${moduleImports || "// TODO: import type <yourModule> from '@scope/<your>-module' and add it to " + modulesType}

// All module imports are \`import type\` — the runtime resolves entries by id
// against the registered descriptors, so this package stays bundle-free of
// module code.
type ${modulesType} = {
${modulesEntries || "  // readonly profile: typeof profileModule;"}
}

export interface ${inputType} {
  // TODO: shape the input the caller passes to runtime.start(handle, input).
  readonly customerId: string;
}

export interface ${stateType} {
  // TODO: shape the state shared across steps. Keep it serializable —
  // persistence adapters round-trip it via JSON.
  readonly customerId: string;
}

export const ${journeyExport} = defineJourney<${modulesType}, ${stateType}>()({
  id: '${params.journeyName}',
  version: '1.0.0',
  meta: {
    name: '${params.journeyPascal}',
  },

  initialState: ({ customerId }: ${inputType}) => ({
    customerId,
  }),

${startBlock}

${transitionsBlock}
})

/**
 * Typed token for opening this journey. Modules and shells import this
 * (via \`import type\`) to call \`runtime.start(handle, input)\` with full
 * input checking — without pulling the journey's runtime into the caller.
 */
export const ${handleExport} = defineJourneyHandle(${journeyExport})
export type ${handleType} = typeof ${handleExport}
`;
}

/**
 * Optional `shell/src/<journey>-persistence.ts`. Generated only when the
 * user passes `--persistence`. Uses `createWebStoragePersistence` and a
 * sensible per-customer key.
 */
export function journeyPersistence(params: JourneyTemplateParams): string {
  const inputType = `${params.journeyPascal}Input`;
  const stateType = `${params.journeyPascal}State`;
  return `import { createWebStoragePersistence } from '@modular-react/journeys'
import type { ${inputType}, ${stateType} } from '${params.scope}/${params.journeyName}-journey'

/**
 * localStorage-backed persistence for the ${params.journeyName} journey.
 * One key per (customerId, journey) pair: starting the journey for the
 * same customer twice resumes the active instance instead of minting a
 * fresh one (see \`JourneyRuntime.start\` idempotency semantics).
 *
 * Pass this to \`registry.registerJourney(${params.journeyCamel}Journey, { persistence })\`.
 */
export const ${params.journeyCamel}Persistence = createWebStoragePersistence<${inputType}, ${stateType}>({
  keyFor: ({ journeyId, input }) => \`journey:\${input.customerId}:\${journeyId}\`,
})
`;
}
