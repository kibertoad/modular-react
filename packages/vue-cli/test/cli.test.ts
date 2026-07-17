import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { execCommand, FileTestHelper } from "cli-testlab";
import { relative, resolve, sep } from "node:path";
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";

/**
 * Read every file under `root` into a `{ "relative/posix/path": contents }`
 * map so a full generated tree can be snapshotted in one assertion. Paths are
 * normalized to forward slashes so the snapshot is stable across platforms.
 */
function readGeneratedTree(root: string): Record<string, string> {
  const tree: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        tree[relative(root, full).split(sep).join("/")] = readFileSync(full, "utf-8");
      }
    }
  };
  walk(root);
  return tree;
}

const CLI = resolve(import.meta.dirname, "..", "dist", "cli.js");
const TMP = resolve(import.meta.dirname, "..", ".test-output");

describe("modular-vue init", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("scaffolds a full Vue project with --scope and --module flags", async () => {
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

    // Verify shell — Vue entry is main.ts and views are SFCs (.vue)
    files.fileExists("my-app/shell/package.json");
    files.fileExists("my-app/shell/vite.config.ts");
    files.fileExists("my-app/shell/index.html");
    files.fileExists("my-app/shell/src/main.ts");
    files.fileExists("my-app/shell/src/stores/auth.ts");
    files.fileExists("my-app/shell/src/stores/config.ts");
    files.fileExists("my-app/shell/src/services/http-client.ts");
    files.fileExists("my-app/shell/src/components/RootLayout.vue");
    files.fileExists("my-app/shell/src/components/ShellLayout.vue");
    files.fileExists("my-app/shell/src/components/Sidebar.vue");
    files.fileExists("my-app/shell/src/components/Home.vue");

    // Verify module with two SFC pages and a route-zone detail panel
    files.fileExists("my-app/modules/dashboard/package.json");
    files.fileExists("my-app/modules/dashboard/src/index.ts");
    files.fileExists("my-app/modules/dashboard/src/pages/DashboardDashboard.vue");
    files.fileExists("my-app/modules/dashboard/src/pages/DashboardList.vue");
    files.fileExists("my-app/modules/dashboard/src/panels/DetailPanel.vue");
    // The first module mirrors `create module` output, incl. a test scaffold.
    files.fileExists("my-app/modules/dashboard/src/__tests__/dashboard.test.ts");
  });

  it("uses scope in generated package names and wires main.ts", async () => {
    files.registerGlobForCleanup(`${TMP}/scoped-app/**`);
    files.registerGlobForCleanup(`${TMP}/scoped-app`);

    await execCommand(`node ${CLI} init scoped-app --scope @acme --module billing`, {
      expectedOutput: "Project created",
      baseDir: TMP,
    });

    const appSharedPkg = readFileSync(resolve(TMP, "scoped-app/app-shared/package.json"), "utf-8");
    expect(appSharedPkg).toContain("@acme/app-shared");
    expect(appSharedPkg).toContain("@modular-vue/vue");

    const modulePkg = readFileSync(
      resolve(TMP, "scoped-app/modules/billing/package.json"),
      "utf-8",
    );
    expect(modulePkg).toContain("@acme/billing-module");
    expect(modulePkg).toContain("@modular-vue/core");
    expect(modulePkg).toContain("vue-tsc");

    const shellPkg = readFileSync(resolve(TMP, "scoped-app/shell/package.json"), "utf-8");
    expect(shellPkg).toContain("@acme/billing-module");
    expect(shellPkg).toContain("@modular-vue/runtime");

    const main = readFileSync(resolve(TMP, "scoped-app/shell/src/main.ts"), "utf-8");
    expect(main).toContain("@acme/app-shared");
    expect(main).toContain("@acme/billing-module");
    expect(main).toContain("registry.register(billing)");
    expect(main).toContain("createModularApp");

    // Verify slots + zones support in generated files
    const appSharedIndex = readFileSync(
      resolve(TMP, "scoped-app/app-shared/src/index.ts"),
      "utf-8",
    );
    expect(appSharedIndex).toContain("AppSlots");
    expect(appSharedIndex).toContain("CommandDefinition");
    expect(appSharedIndex).toContain("createSharedComposables");
    expect(appSharedIndex).toContain("declare module 'vue-router'");

    const moduleIndex = readFileSync(
      resolve(TMP, "scoped-app/modules/billing/src/index.ts"),
      "utf-8",
    );
    expect(moduleIndex).toContain("AppSlots");
    expect(moduleIndex).toContain("defineModule");
    expect(moduleIndex).toContain("RouteRecordRaw");
  });
});

describe("modular-vue create module", { sequential: true }, () => {
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

    await execCommand(`node ${CLI} init create-mod-test --scope @test --module home`, {
      baseDir: TMP,
    });

    await execCommand(`node ${CLI} create module orders --route orders --nav-group commerce`, {
      expectedOutput: 'Module "orders" created',
      baseDir: resolve(TMP, "create-mod-test"),
    });

    files.fileExists("create-mod-test/modules/orders/package.json");
    files.fileExists("create-mod-test/modules/orders/src/index.ts");
    files.fileExists("create-mod-test/modules/orders/src/pages/OrdersDashboard.vue");
    files.fileExists("create-mod-test/modules/orders/src/pages/OrdersList.vue");

    const main = readFileSync(resolve(TMP, "create-mod-test/shell/src/main.ts"), "utf-8");
    expect(main).toContain("@test/orders-module");
    expect(main).toContain("registry.register(orders)");

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

describe("modular-vue create store", { sequential: true }, () => {
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

    files.fileExists("store-test/shell/src/stores/notifications.ts");

    const store = readFileSync(
      resolve(TMP, "store-test/shell/src/stores/notifications.ts"),
      "utf-8",
    );
    expect(store).toContain("@modular-vue/vue");
    expect(store).toContain("createStore");

    const appSharedIndex = readFileSync(
      resolve(TMP, "store-test/app-shared/src/index.ts"),
      "utf-8",
    );
    expect(appSharedIndex).toContain("NotificationsStore");
    expect(appSharedIndex).toContain("notifications: NotificationsStore");

    const main = readFileSync(resolve(TMP, "store-test/shell/src/main.ts"), "utf-8");
    expect(main).toContain("notificationsStore");
    expect(main).toContain("notifications: notificationsStore");
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

describe("modular-vue create journey", { sequential: true }, () => {
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

    files.fileExists("journey-test/journeys/customer-onboarding/package.json");
    files.fileExists("journey-test/journeys/customer-onboarding/tsconfig.json");
    files.fileExists("journey-test/journeys/customer-onboarding/src/index.ts");
    files.fileExists("journey-test/journeys/customer-onboarding/src/customer-onboarding.ts");
    files.fileExists("journey-test/shell/src/customer-onboarding-persistence.ts");

    const journeyDef = readFileSync(
      resolve(TMP, "journey-test/journeys/customer-onboarding/src/customer-onboarding.ts"),
      "utf-8",
    );
    expect(journeyDef).toContain("defineJourney");
    expect(journeyDef).toContain("defineJourneyHandle");
    expect(journeyDef).toContain("@modular-vue/journeys");
    expect(journeyDef).toContain("@test/profile-module");
    expect(journeyDef).toContain("@test/billing-module");
    expect(journeyDef).toContain("customerOnboardingJourney");
    expect(journeyDef).toContain("customerOnboardingHandle");

    const shellPkg = readFileSync(resolve(TMP, "journey-test/shell/package.json"), "utf-8");
    expect(shellPkg).toContain("@test/customer-onboarding-journey");
    expect(shellPkg).toContain("@modular-vue/journeys");

    const main = readFileSync(resolve(TMP, "journey-test/shell/src/main.ts"), "utf-8");
    expect(main).toContain("journeysPlugin()");
    expect(main).toContain(
      "registry.registerJourney(customerOnboardingJourney, { persistence: customerOnboardingPersistence })",
    );
    expect(main).toContain("from '@test/customer-onboarding-journey'");
    expect(main).toContain(
      "import { customerOnboardingPersistence } from './customer-onboarding-persistence.js'",
    );
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
});

describe("modular-vue init guards", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("refuses to clobber an existing target directory", async () => {
    files.registerGlobForCleanup(`${TMP}/clobber-test/**`);
    files.registerGlobForCleanup(`${TMP}/clobber-test`);

    await execCommand(`node ${CLI} init clobber-test --scope @test --module home`, {
      baseDir: TMP,
    });

    await execCommand(`node ${CLI} init clobber-test --scope @test --module home`, {
      expectedErrorMessage: "already exists",
      baseDir: TMP,
    });
  });

  it("fails fast when invoked with partial flags (CI-safe)", async () => {
    await execCommand(`node ${CLI} init --scope @test`, {
      expectedErrorMessage: "Non-interactive init requires",
      baseDir: TMP,
    });
  });
});

describe("modular-vue dashed names", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  // The descriptor `label`, the SFC pages, and the test assertions must all
  // agree on PascalCase for a dashed module name.
  it("PascalCases dashed module names consistently across descriptor, page, and test", async () => {
    files.registerGlobForCleanup(`${TMP}/dashed-app/**`);
    files.registerGlobForCleanup(`${TMP}/dashed-app`);

    await execCommand(`node ${CLI} init dashed-app --scope @test --module home`, {
      baseDir: TMP,
    });
    await execCommand(`node ${CLI} create module customer-orders --route customer-orders`, {
      baseDir: resolve(TMP, "dashed-app"),
    });

    const desc = readFileSync(
      resolve(TMP, "dashed-app/modules/customer-orders/src/index.ts"),
      "utf-8",
    );
    expect(desc).toContain("CustomerOrders");
    expect(desc).not.toContain("Customer-orders");

    const page = readFileSync(
      resolve(TMP, "dashed-app/modules/customer-orders/src/pages/CustomerOrdersDashboard.vue"),
      "utf-8",
    );
    expect(page).toContain("<h2>CustomerOrders</h2>");

    const test = readFileSync(
      resolve(TMP, "dashed-app/modules/customer-orders/src/__tests__/customer-orders.test.ts"),
      "utf-8",
    );
    expect(test).toContain("'CustomerOrders'");
    expect(test).toContain("'CustomerOrders List'");
    expect(test).not.toContain("'Customer-orders'");
  });
});

describe("create catalog / init --with-catalog", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("scaffolds catalog.config.ts and wires the root package.json via init --with-catalog", async () => {
    files.registerGlobForCleanup(`${TMP}/cat-app/**`);
    files.registerGlobForCleanup(`${TMP}/cat-app`);

    await execCommand(`node ${CLI} init cat-app --scope @cat --module dashboard --with-catalog`, {
      expectedOutput: "Project created",
      baseDir: TMP,
    });

    files.fileExists("cat-app/catalog.config.ts");

    const config = readFileSync(resolve(TMP, "cat-app/catalog.config.ts"), "utf-8");
    expect(config).toContain("defineCatalogConfig");
    expect(config).toContain("modules/*/src/index.ts");
    expect(config).toContain("journeys/*/src/index.ts");

    const rootPkg = JSON.parse(readFileSync(resolve(TMP, "cat-app/package.json"), "utf-8"));
    expect(rootPkg.scripts["catalog:build"]).toBe("modular-react-catalog build");
    expect(rootPkg.devDependencies["@modular-react/catalog"]).toBeTruthy();
  });
});

// Guards a stable generated Vue tree across init + create module/store/journey.
describe("modular-vue generated tree snapshot", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  it("emits a stable project tree across init + create module/store/journey", async () => {
    files.registerGlobForCleanup(`${TMP}/snap-app/**`);
    files.registerGlobForCleanup(`${TMP}/snap-app`);

    await execCommand(`node ${CLI} init snap-app --scope @acme --module dashboard --with-catalog`, {
      baseDir: TMP,
    });
    const project = resolve(TMP, "snap-app");
    await execCommand(`node ${CLI} create module orders --route orders --nav-group commerce`, {
      baseDir: project,
    });
    await execCommand(`node ${CLI} create store notifications`, { baseDir: project });
    await execCommand(
      `node ${CLI} create journey customer-onboarding --modules dashboard,orders --persistence`,
      { baseDir: project },
    );

    expect(readGeneratedTree(project)).toMatchSnapshot();
  });
});
