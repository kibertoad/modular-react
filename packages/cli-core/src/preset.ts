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
  /**
   * Framework-level scaffolding coordinates: the view/entry file extensions
   * and optional overrides for the framework-neutral `package.json` / config
   * bodies. React presets set only `entryMain` / `viewExt` (the neutral
   * builders then emit their React-family defaults, byte-identical to
   * pre-PR-50 output); a Vue preset supplies the SFC-family overrides.
   */
  readonly scaffold: PresetScaffold;
}

export interface PresetScaffold {
  /**
   * Shell entry module filename written under `shell/src/` — `main.tsx` for
   * React, `main.ts` for Vue. The `create module` / `create store` /
   * `create journey` transforms edit this same file.
   */
  readonly entryMain: string;
  /**
   * Extension (no dot) for generated view files — pages, panels, and shell
   * layout components: `tsx` for React, `vue` for Vue.
   */
  readonly viewExt: string;
  /**
   * Optional overrides for the framework-neutral scaffolding bodies. When an
   * override is omitted, `cli-core` emits its React-family default. A Vue
   * preset supplies these to produce a `vue` / `vue-router` / `vue-tsc`
   * workspace instead of a `react` / `zustand` one.
   */
  rootPackageJson?(params: RootPackageJsonParams): string;
  pnpmWorkspace?(): string;
  tsconfigBase?(): string;
  /**
   * Optional root `vitest.config.ts`. Frameworks whose module tests render
   * non-JS view files (e.g. Vue SFCs) need a Vitest config that registers the
   * framework's transform plugin. When omitted, no root Vitest config is
   * written (React relies on Vitest's defaults).
   */
  rootVitestConfig?(): string;
  modulePackageJson?(params: ModulePackageJsonParams): string;
  moduleTsconfig?(): string;
  shellPackageJson?(params: ShellPackageJsonParams): string;
  shellTsconfig?(): string;
  shellHttpClient?(): string;
  appSharedPackageJson?(params: AppSharedPackageJsonParams): string;
  appSharedTsconfig?(): string;
  appSharedTypes?(): string;
  journeyPackageJson?(params: JourneyTemplateParams): string;
  journeyTsconfig?(): string;
  journeyIndex?(params: JourneyTemplateParams): string;
}

export interface RootPackageJsonParams {
  readonly name: string;
}

export interface ModulePackageJsonParams {
  readonly scope: string;
  readonly name: string;
}

export interface ShellPackageJsonParams {
  readonly scope: string;
  readonly moduleName: string;
}

export interface AppSharedPackageJsonParams {
  readonly scope: string;
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
  /**
   * Version range for the shell's direct dependency on {@link journeys}. When
   * omitted, `cli-core` falls back to its own `RUNTIME_VERSIONS.journeys` — the
   * right source for the React families, whose journeys binding is versioned in
   * lockstep with `cli-core`. A preset whose journeys binding versions
   * independently (e.g. `@modular-vue/journeys`) should set this so the shell's
   * range stays in sync with the version its generated journey packages pin,
   * rather than tracking the React constant.
   */
  readonly journeysVersion?: string;
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
