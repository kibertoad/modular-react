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
  /**
   * Journeys binding the scaffolded journey packages import from (e.g.
   * `@modular-react/journeys`). Both React router families share the React
   * journeys binding; a Vue preset would point this at `@modular-vue/journeys`.
   */
  readonly journeys: string;
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
  /** `shell/vite.config.ts` — carries the framework's Vite plugin + dedupe list. */
  shellViteConfig(): string;
  /** `shell/index.html` — references the framework's entry module (e.g. `main.tsx`). */
  shellIndexHtml(params: ShellIndexHtmlParams): string;
  /** `shell/src/stores/auth.ts` — the framework's store primitive (zustand for React). */
  shellAuthStore(params: ShellAuthStoreParams): string;
  /** `shell/src/stores/config.ts` — the framework's store primitive. */
  shellConfigStore(params: ShellConfigStoreParams): string;
  /** `shell/src/components/Home.*` — the landing component in the framework's view syntax. */
  shellHome(params: ShellHomeParams): string;
  moduleDescriptor(params: ModuleDescriptorParams): string;
  modulePage(params: ModulePageParams): string;
  moduleListPage(params: ModuleListPageParams): string;
  moduleDetailPanel(params: ModuleDetailPanelParams): string;
  moduleTest(params: ModuleTestParams): string;
  /** `shell/src/stores/<name>.ts` — a `create store` scaffold in the framework's store primitive. */
  storeFile(params: StoreFileParams): string;
  /** `journeys/<name>/src/<name>.ts` — the journey definition importing the journeys binding. */
  journeyDefinition(params: JourneyTemplateParams): string;
  /** `shell/src/<name>-persistence.ts` — optional persistence adapter for a journey. */
  journeyPersistence(params: JourneyTemplateParams): string;
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

export interface ShellIndexHtmlParams {
  readonly projectName: string;
}

export interface ShellAuthStoreParams {
  readonly scope: string;
}

export interface ShellConfigStoreParams {
  readonly scope: string;
  readonly appName: string;
}

export interface ShellHomeParams {
  readonly scope: string;
}

export interface StoreFileParams {
  readonly scope: string;
  /** PascalCase interface name (e.g. `NotificationsStore`). */
  readonly interfaceName: string;
  /** camelCase export name (e.g. `notificationsStore`). */
  readonly exportName: string;
}

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

export interface ModuleDescriptorParams {
  readonly scope: string;
  readonly name: string;
  readonly route: string;
  readonly pageName: string;
  readonly listPageName: string;
  readonly navGroup?: string;
  /** PascalCase label (e.g. `CustomerOrders` for `customer-orders`). */
  readonly moduleLabel: string;
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
  /**
   * PascalCase label rendered by the page templates (e.g. `CustomerOrders`
   * for a `customer-orders` module). The test asserts on this exact text,
   * so the label must match what `modulePage` / `moduleListPage` render.
   */
  readonly moduleLabel: string;
}
