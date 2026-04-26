/**
 * A `CliPreset` carries everything the shared command implementations need
 * to know about a router integration (React Router, TanStack Router, ...):
 * the binary name and version, the package names that show up in generated
 * `package.json` files and source imports, and the router-specific template
 * fragments (shell, module descriptor, app-shared, etc.).
 *
 * The router-specific CLI packages each export a single preset and pass it
 * to the command factories from this package.
 */
export interface CliPreset {
  /** The binary name (e.g. `react-router-modules`). */
  readonly cliName: string;
  /** The CLI version. Surfaced via `--version`. */
  readonly cliVersion: string;
  /** The CLI description shown in `--help`. */
  readonly cliDescription: string;
  /** Package coordinates the templates depend on. */
  readonly packages: PresetPackages;
  /** Documentation links the templates reference inline. */
  readonly docs: PresetDocs;
  /** Router-specific template fragments. */
  readonly templates: PresetTemplates;
}

export interface PresetPackages {
  /** Module-author-facing core (e.g. `@react-router-modules/core`). */
  readonly core: string;
  /** Shell-author-facing runtime (e.g. `@react-router-modules/runtime`). */
  readonly runtime: string;
  /** Test helpers (e.g. `@react-router-modules/testing`). */
  readonly testing: string;
  /** Underlying router (e.g. `react-router`, `@tanstack/react-router`). */
  readonly router: string;
  /** Pinned router version range (e.g. `^7.6.0`). */
  readonly routerVersion: string;
}

export interface PresetDocs {
  /** Path under `docs/` to the router-specific shell-patterns guide. */
  readonly shellPatterns: string;
}

export interface PresetTemplates {
  appSharedIndex(params: AppSharedIndexParams): string;
  appSharedExtraDeps?: AppSharedExtraDeps;
  shellMain(params: ShellMainParams): string;
  shellMainWithJourneys?(params: ShellMainParams): string;
  shellRootLayout(): string;
  shellShellLayout(params: ShellShellLayoutParams): string;
  shellSidebar(params: ShellSidebarParams): string;
  shellViteDedupe: readonly string[];
  moduleDescriptor(params: ModuleDescriptorParams): string;
  modulePage(params: ModulePageParams): string;
  moduleListPage(params: ModuleListPageParams): string;
  moduleDetailPanel(params: ModuleDetailPanelParams): string;
  moduleTest(params: ModuleTestParams): string;
}

export interface AppSharedIndexParams {
  readonly scope: string;
}

export interface AppSharedExtraDeps {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

export interface ShellMainParams {
  readonly scope: string;
  readonly moduleName: string;
  readonly importName: string;
  readonly docsLink: string;
}

export interface ShellShellLayoutParams {
  readonly scope: string;
}

export interface ShellSidebarParams {
  readonly projectName: string;
}

export interface ModuleDescriptorParams {
  readonly scope: string;
  readonly name: string;
  readonly route: string;
  readonly pageName: string;
  readonly listPageName: string;
  readonly navGroup?: string;
}

export interface ModulePageParams {
  readonly scope: string;
  readonly pageName: string;
  readonly moduleLabel: string;
  readonly moduleName: string;
}

export interface ModuleListPageParams {
  readonly scope: string;
  readonly pageName: string;
  readonly moduleLabel: string;
}

export interface ModuleDetailPanelParams {
  readonly moduleLabel: string;
}

export interface ModuleTestParams {
  readonly scope: string;
  readonly name: string;
  readonly importName: string;
  readonly route: string;
  readonly pageName: string;
}
