import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { execCommand, FileTestHelper } from "cli-testlab";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CLI = resolve(import.meta.dirname, "..", "dist", "cli.js");
const TMP = resolve(import.meta.dirname, "..", ".test-output");

describe("react-router-modules init", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("scaffolds a full project with --scope and --module flags", async () => {
    files.registerGlobForCleanup(`${TMP}/my-app/**`);
    files.registerGlobForCleanup(`${TMP}/my-app`);

    await execCommand(`node ${CLI} init my-app --scope @test --module dashboard`, {
      expectedOutput: "Project created",
      baseDir: TMP,
    });

    // Verify root files
    files.fileExists("my-app/package.json");
    files.fileExists("my-app/pnpm-workspace.yaml");
    files.fileExists("my-app/tsconfig.base.json");
    files.fileExists("my-app/.gitignore");

    // Verify app-shared
    files.fileExists("my-app/app-shared/package.json");
    files.fileExists("my-app/app-shared/src/index.ts");
    files.fileExists("my-app/app-shared/src/types.ts");

    // Verify shell
    files.fileExists("my-app/shell/package.json");
    files.fileExists("my-app/shell/vite.config.ts");
    files.fileExists("my-app/shell/index.html");
    files.fileExists("my-app/shell/src/main.tsx");
    files.fileExists("my-app/shell/src/stores/auth.ts");
    files.fileExists("my-app/shell/src/stores/config.ts");
    files.fileExists("my-app/shell/src/services/http-client.ts");
    files.fileExists("my-app/shell/src/components/RootLayout.tsx");
    files.fileExists("my-app/shell/src/components/ShellLayout.tsx");
    files.fileExists("my-app/shell/src/components/Sidebar.tsx");
    files.fileExists("my-app/shell/src/components/Home.tsx");

    // Verify module with two pages and a route-zone detail panel
    files.fileExists("my-app/modules/dashboard/package.json");
    files.fileExists("my-app/modules/dashboard/src/index.ts");
    files.fileExists("my-app/modules/dashboard/src/pages/DashboardDashboard.tsx");
    files.fileExists("my-app/modules/dashboard/src/pages/DashboardList.tsx");
    files.fileExists("my-app/modules/dashboard/src/panels/DetailPanel.tsx");
  });

  it("uses scope in generated package names", async () => {
    files.registerGlobForCleanup(`${TMP}/scoped-app/**`);
    files.registerGlobForCleanup(`${TMP}/scoped-app`);

    await execCommand(`node ${CLI} init scoped-app --scope @acme --module billing`, {
      expectedOutput: "Project created",
      baseDir: TMP,
    });

    const appSharedPkg = readFileSync(resolve(TMP, "scoped-app/app-shared/package.json"), "utf-8");
    expect(appSharedPkg).toContain("@acme/app-shared");

    const modulePkg = readFileSync(
      resolve(TMP, "scoped-app/modules/billing/package.json"),
      "utf-8",
    );
    expect(modulePkg).toContain("@acme/billing-module");

    const shellPkg = readFileSync(resolve(TMP, "scoped-app/shell/package.json"), "utf-8");
    expect(shellPkg).toContain("@acme/billing-module");

    const mainTsx = readFileSync(resolve(TMP, "scoped-app/shell/src/main.tsx"), "utf-8");
    expect(mainTsx).toContain("@acme/app-shared");
    expect(mainTsx).toContain("@acme/billing-module");
    expect(mainTsx).toContain("registry.register(billing)");

    // Verify slots support in generated files
    const appSharedIndex = readFileSync(
      resolve(TMP, "scoped-app/app-shared/src/index.ts"),
      "utf-8",
    );
    expect(appSharedIndex).toContain("AppSlots");
    expect(appSharedIndex).toContain("CommandDefinition");
    expect(mainTsx).toContain("AppSlots");

    const moduleIndex = readFileSync(
      resolve(TMP, "scoped-app/modules/billing/src/index.ts"),
      "utf-8",
    );
    expect(moduleIndex).toContain("AppSlots");
  });
});

describe("react-router-modules create module", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("creates a module and wires it into shell", async () => {
    files.registerGlobForCleanup(`${TMP}/create-mod-test/**`);
    files.registerGlobForCleanup(`${TMP}/create-mod-test`);

    // First create a project
    await execCommand(`node ${CLI} init create-mod-test --scope @test --module home`, {
      baseDir: TMP,
    });

    // Then add a module
    await execCommand(`node ${CLI} create module orders --route orders --nav-group commerce`, {
      expectedOutput: 'Module "orders" created',
      baseDir: resolve(TMP, "create-mod-test"),
    });

    // Verify module files
    files.fileExists("create-mod-test/modules/orders/package.json");
    files.fileExists("create-mod-test/modules/orders/src/index.ts");
    files.fileExists("create-mod-test/modules/orders/src/pages/OrdersDashboard.tsx");
    files.fileExists("create-mod-test/modules/orders/src/pages/OrdersList.tsx");

    // Verify shell was updated
    const mainTsx = readFileSync(resolve(TMP, "create-mod-test/shell/src/main.tsx"), "utf-8");
    expect(mainTsx).toContain("@test/orders-module");
    expect(mainTsx).toContain("registry.register(orders)");

    const shellPkg = readFileSync(resolve(TMP, "create-mod-test/shell/package.json"), "utf-8");
    expect(shellPkg).toContain("@test/orders-module");
  });

  it("rejects duplicate module names", async () => {
    files.registerGlobForCleanup(`${TMP}/dup-mod-test/**`);
    files.registerGlobForCleanup(`${TMP}/dup-mod-test`);

    await execCommand(`node ${CLI} init dup-mod-test --scope @test --module home`, {
      baseDir: TMP,
    });

    await execCommand(`node ${CLI} create module home`, {
      expectedErrorMessage: "already exists",
      baseDir: resolve(TMP, "dup-mod-test"),
    });
  });
});

describe("react-router-modules create store", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("creates a store and wires into AppDependencies", async () => {
    files.registerGlobForCleanup(`${TMP}/store-test/**`);
    files.registerGlobForCleanup(`${TMP}/store-test`);

    await execCommand(`node ${CLI} init store-test --scope @test --module home`, {
      baseDir: TMP,
    });

    await execCommand(`node ${CLI} create store notifications`, {
      expectedOutput: 'Store "notifications" created',
      baseDir: resolve(TMP, "store-test"),
    });

    // Verify store file
    files.fileExists("store-test/shell/src/stores/notifications.ts");

    // Verify AppDependencies updated
    const appSharedIndex = readFileSync(
      resolve(TMP, "store-test/app-shared/src/index.ts"),
      "utf-8",
    );
    expect(appSharedIndex).toContain("NotificationsStore");
    expect(appSharedIndex).toContain("notifications: NotificationsStore");

    // Verify main.tsx updated
    const mainTsx = readFileSync(resolve(TMP, "store-test/shell/src/main.tsx"), "utf-8");
    expect(mainTsx).toContain("notificationsStore");
    expect(mainTsx).toContain("notifications: notificationsStore");
  });

  it("rejects duplicate store names", async () => {
    files.registerGlobForCleanup(`${TMP}/dup-store-test/**`);
    files.registerGlobForCleanup(`${TMP}/dup-store-test`);

    await execCommand(`node ${CLI} init dup-store-test --scope @test --module home`, {
      baseDir: TMP,
    });

    await execCommand(`node ${CLI} create store auth`, {
      expectedErrorMessage: "already exists",
      baseDir: resolve(TMP, "dup-store-test"),
    });
  });
});

describe("react-router-modules create journey", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("scaffolds a journey package and wires it into the shell", async () => {
    files.registerGlobForCleanup(`${TMP}/journey-test/**`);
    files.registerGlobForCleanup(`${TMP}/journey-test`);

    await execCommand(`node ${CLI} init journey-test --scope @test --module profile`, {
      baseDir: TMP,
    });
    await execCommand(`node ${CLI} create module billing`, {
      baseDir: resolve(TMP, "journey-test"),
    });
    await execCommand(
      `node ${CLI} create journey customer-onboarding --modules profile,billing --persistence`,
      {
        expectedOutput: 'Journey "customer-onboarding" created',
        baseDir: resolve(TMP, "journey-test"),
      },
    );

    // Journey package files
    files.fileExists("journey-test/journeys/customer-onboarding/package.json");
    files.fileExists("journey-test/journeys/customer-onboarding/tsconfig.json");
    files.fileExists("journey-test/journeys/customer-onboarding/src/index.ts");
    files.fileExists("journey-test/journeys/customer-onboarding/src/customer-onboarding.ts");

    // Persistence adapter generated under shell/
    files.fileExists("journey-test/shell/src/customer-onboarding-persistence.ts");

    // Journey definition mentions the composed modules and uses defineJourney + handle.
    const journeyDef = readFileSync(
      resolve(TMP, "journey-test/journeys/customer-onboarding/src/customer-onboarding.ts"),
      "utf-8",
    );
    expect(journeyDef).toContain("defineJourney");
    expect(journeyDef).toContain("defineJourneyHandle");
    expect(journeyDef).toContain("@test/profile-module");
    expect(journeyDef).toContain("@test/billing-module");
    expect(journeyDef).toContain("customerOnboardingJourney");
    expect(journeyDef).toContain("customerOnboardingHandle");

    // Shell package.json picked up the journey + journeys runtime.
    const shellPkg = readFileSync(resolve(TMP, "journey-test/shell/package.json"), "utf-8");
    expect(shellPkg).toContain("@test/customer-onboarding-journey");
    expect(shellPkg).toContain("@modular-react/journeys");

    // Shell main.tsx wires the plugin and registerJourney call.
    const mainTsx = readFileSync(resolve(TMP, "journey-test/shell/src/main.tsx"), "utf-8");
    expect(mainTsx).toContain("journeysPlugin()");
    expect(mainTsx).toContain("registry.registerJourney(customerOnboardingJourney)");
    expect(mainTsx).toContain("from '@test/customer-onboarding-journey'");
  });

  it("rejects modules that don't exist yet", async () => {
    files.registerGlobForCleanup(`${TMP}/journey-missing/**`);
    files.registerGlobForCleanup(`${TMP}/journey-missing`);

    await execCommand(`node ${CLI} init journey-missing --scope @test --module home`, {
      baseDir: TMP,
    });

    await execCommand(`node ${CLI} create journey onboarding --modules nonexistent`, {
      expectedErrorMessage: "Module(s) not found",
      baseDir: resolve(TMP, "journey-missing"),
    });
  });

  // Older projects scaffolded before `journeys/*` was added to the default
  // workspace template need it injected on first journey creation.
  it("adds journeys/* to pnpm-workspace.yaml when missing", async () => {
    files.registerGlobForCleanup(`${TMP}/journey-retrofit/**`);
    files.registerGlobForCleanup(`${TMP}/journey-retrofit`);

    await execCommand(`node ${CLI} init journey-retrofit --scope @test --module home`, {
      baseDir: TMP,
    });

    // Simulate an older scaffold by rewriting the workspace yaml without `journeys/*`.
    const wsPath = resolve(TMP, "journey-retrofit/pnpm-workspace.yaml");
    writeFileSync(wsPath, "packages:\n  - app-shared\n  - shell\n  - modules/*\n");

    await execCommand(`node ${CLI} create journey onboarding`, {
      baseDir: resolve(TMP, "journey-retrofit"),
    });

    const ws = readFileSync(wsPath, "utf-8");
    expect(ws).toContain("- journeys/*");
  });
});
