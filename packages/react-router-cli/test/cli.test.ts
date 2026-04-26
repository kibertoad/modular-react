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
    // The first module must mirror `create module` output, which includes
    // a `__tests__/<name>.test.ts` so the project has a test scaffold from
    // day one rather than only from the second module onward.
    files.fileExists("my-app/modules/dashboard/src/__tests__/dashboard.test.ts");
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

  // Regression: a previous version inserted the AppDependencies property
  // even when the `// ---- The contract ----` marker was missing, so the
  // file ended up with a property pointing at a never-declared interface.
  // We now refuse rather than producing partial, type-broken edits.
  it("refuses to wire a store when the app-shared marker is missing", async () => {
    files.registerGlobForCleanup(`${TMP}/marker-test/**`);
    files.registerGlobForCleanup(`${TMP}/marker-test`);

    await execCommand(`node ${CLI} init marker-test --scope @test --module home`, {
      baseDir: TMP,
    });

    // Strip the marker — simulating someone reformatting away the
    // anchor the CLI relies on.
    const indexPath = resolve(TMP, "marker-test/app-shared/src/index.ts");
    const original = readFileSync(indexPath, "utf-8");
    writeFileSync(indexPath, original.replace("// ---- The contract ----", ""));

    await execCommand(`node ${CLI} create store notifications`, {
      expectedErrorMessage: "The contract",
      baseDir: resolve(TMP, "marker-test"),
    });

    // The index.ts must not have been partially mutated — no
    // NotificationsStore reference should sneak into AppDependencies.
    const after = readFileSync(indexPath, "utf-8");
    expect(after).not.toContain("notifications: NotificationsStore");
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

    // Shell main.tsx wires the plugin and registerJourney call. With
    // --persistence, the call carries the persistence adapter as its
    // second arg and the binding is imported from the generated file.
    const mainTsx = readFileSync(resolve(TMP, "journey-test/shell/src/main.tsx"), "utf-8");
    expect(mainTsx).toContain("journeysPlugin()");
    expect(mainTsx).toContain(
      "registry.registerJourney(customerOnboardingJourney, { persistence: customerOnboardingPersistence })",
    );
    expect(mainTsx).toContain("from '@test/customer-onboarding-journey'");
    expect(mainTsx).toContain(
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

  // Older projects scaffolded before `journeys/*` was added to the default
  // workspace template need it injected on first journey creation.
  // Regression: a previous version of this transform walked the whole
  // file looking for the last `- ` list item, which meant `journeys/*`
  // landed under `onlyBuiltDependencies:` whenever that block was present.
  it("adds journeys/* under packages: even when onlyBuiltDependencies is present", async () => {
    files.registerGlobForCleanup(`${TMP}/journey-retrofit/**`);
    files.registerGlobForCleanup(`${TMP}/journey-retrofit`);

    await execCommand(`node ${CLI} init journey-retrofit --scope @test --module home`, {
      baseDir: TMP,
    });

    // Simulate an older scaffold: no `journeys/*` glob, but
    // `onlyBuiltDependencies` does live below `packages:`.
    const wsPath = resolve(TMP, "journey-retrofit/pnpm-workspace.yaml");
    writeFileSync(
      wsPath,
      "packages:\n  - app-shared\n  - shell\n  - modules/*\n\nonlyBuiltDependencies:\n  - esbuild\n",
    );

    await execCommand(`node ${CLI} create journey onboarding`, {
      baseDir: resolve(TMP, "journey-retrofit"),
    });

    const ws = readFileSync(wsPath, "utf-8");
    expect(ws).toContain("- journeys/*");
    // Verify the glob landed inside the packages: block, not under
    // onlyBuiltDependencies. Easiest check: journeys/* must appear before
    // `onlyBuiltDependencies:` in the file.
    expect(ws.indexOf("- journeys/*")).toBeLessThan(ws.indexOf("onlyBuiltDependencies:"));
  });
});

describe("react-router-modules init guards", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  // Init must not silently overwrite an existing project. A previous
  // version blindly mkdir+writeFile'd over whatever was in place.
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

  // Init runs in CI as soon as ANY flag is passed; missing args must
  // fail fast rather than block on stdin.
  it("fails fast when invoked with partial flags (CI-safe)", async () => {
    await execCommand(`node ${CLI} init --scope @test`, {
      expectedErrorMessage: "Non-interactive init requires",
      baseDir: TMP,
    });
  });
});

describe("react-router-modules dashed names", { sequential: true }, () => {
  const files = new FileTestHelper({ basePath: TMP, maxRetries: 5, retryDelay: 200 });

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    files.cleanup();
  });

  // Regression: the descriptor `label` and the test assertions used a
  // first-char-only `capitalize`, so a `customer-orders` module would
  // render `<h2>CustomerOrders</h2>` while the test searched for
  // `Customer-orders`. Both must agree on PascalCase.
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
      resolve(TMP, "dashed-app/modules/customer-orders/src/pages/CustomerOrdersDashboard.tsx"),
      "utf-8",
    );
    expect(page).toContain("<h2>CustomerOrders</h2>");

    const test = readFileSync(
      resolve(TMP, "dashed-app/modules/customer-orders/src/__tests__/customer-orders.test.ts"),
      "utf-8",
    );
    // The test must look for the same PascalCase label the page renders
    // (and not the broken `Customer-orders`).
    expect(test).toContain("'CustomerOrders'");
    expect(test).toContain("'CustomerOrders List'");
    expect(test).not.toContain("'Customer-orders'");
  });
});
