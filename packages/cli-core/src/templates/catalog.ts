/**
 * `catalog.config.ts` written at the workspace root by `init --with-catalog`
 * and `create catalog`. Drives `@modular-react/catalog`'s `build`/`serve`
 * commands: it scans the conventional `modules/*` and `journeys/*` layout the
 * CLI scaffolds and harvests each descriptor into a static catalog UI.
 *
 * Modules are `export default defineModule(...)` -> `"defaultExport"`.
 * Journeys re-export a named `<journey>Journey` binding -> `"namedExport"`.
 */
export function catalogConfig(params: { projectName: string; scope: string }): string {
  // Escape single quotes so a name like `O'Reilly` can't break out of the
  // single-quoted string literal in the generated config.
  const title = `${params.projectName} Catalog`.replace(/'/g, "\\'");
  return `import { defineCatalogConfig } from '@modular-react/catalog'

export default defineCatalogConfig({
  title: '${title}',
  out: 'dist-catalog',
  roots: [
    {
      name: 'modules',
      pattern: 'modules/*/src/index.ts',
      resolver: 'defaultExport',
    },
    {
      name: 'journeys',
      pattern: 'journeys/*/src/index.ts',
      resolver: 'namedExport',
    },
  ],

  // The harvester loads each descriptor for real, so its imports must
  // resolve. After \`pnpm install\` the workspace packages (e.g.
  // \`${params.scope}/app-shared\`) are symlinked into node_modules and
  // resolve automatically. If you harvest without installing, mirror your
  // path aliases here:
  // resolve: {
  //   alias: {
  //     '${params.scope}/app-shared': './app-shared/src',
  //   },
  // },
})
`;
}

/** Catalog config filename, written at the workspace root. */
export const CATALOG_CONFIG_FILENAME = "catalog.config.ts";
