import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "pathe";

/**
 * Add a module import and registry.register() call to main.tsx.
 * Uses string manipulation (not AST) since the file structure is predictable.
 */
export function addModuleToMain(
  shellDir: string,
  params: { scope: string; moduleName: string; importName: string },
): void {
  const mainPath = resolve(shellDir, "src", "main.tsx");
  let content = readFileSync(mainPath, "utf-8");

  const importLine = `import ${params.importName} from '${params.scope}/${params.moduleName}-module'`;

  // Add import after last existing import
  const importLines = content.split("\n").filter((line: string) => line.startsWith("import "));
  const lastImport = importLines[importLines.length - 1];
  content = content.replace(lastImport, `${lastImport}\n${importLine}`);

  // Add registry.register() after the last existing registry.register() call
  const registerLines = content.split("\n");
  let lastRegisterIndex = -1;
  for (let i = 0; i < registerLines.length; i++) {
    if (registerLines[i].includes("registry.register(")) {
      lastRegisterIndex = i;
    }
  }

  if (lastRegisterIndex !== -1) {
    registerLines.splice(lastRegisterIndex + 1, 0, `registry.register(${params.importName})`);
    content = registerLines.join("\n");
  } else {
    // Fallback: insert before registry.resolve()
    const resolveMatch = content.match(/^.*registry\.resolve\(/m);
    if (resolveMatch) {
      content = content.replace(
        resolveMatch[0],
        `registry.register(${params.importName})\n\n${resolveMatch[0]}`,
      );
    }
  }

  writeFileSync(mainPath, content);
}

/**
 * Add a module dependency to shell's package.json.
 */
export function addModuleToShellPackageJson(
  shellDir: string,
  params: { scope: string; moduleName: string },
): void {
  const pkgPath = resolve(shellDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies[`${params.scope}/${params.moduleName}-module`] = "workspace:*";

  // Sort dependencies
  pkg.dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

/**
 * Add a store interface to AppDependencies and wire it into the registry.
 */
export function addStoreToAppShared(
  appSharedDir: string,
  params: { storeName: string; interfaceName: string },
): void {
  const indexPath = resolve(appSharedDir, "src", "index.ts");
  let content = readFileSync(indexPath, "utf-8");

  // Add interface before AppDependencies
  const appDepsMatch = content.match(/^\/\/ ---- The contract ----/m);
  if (appDepsMatch) {
    const storeInterface = `export interface ${params.interfaceName} {
  // TODO: Add store state and actions
}

`;
    content = content.replace(
      "// ---- The contract ----",
      storeInterface + "// ---- The contract ----",
    );
  }

  // Add property to AppDependencies interface
  const closingBrace = content.indexOf("}", content.indexOf("export interface AppDependencies"));
  if (closingBrace !== -1) {
    const before = content.slice(0, closingBrace);
    const after = content.slice(closingBrace);
    content = before + `  ${params.storeName}: ${params.interfaceName}\n` + after;
  }

  writeFileSync(indexPath, content);
}

/**
 * Add store import and wire into createRegistry() stores in main.tsx.
 */
export function addStoreToMain(
  shellDir: string,
  params: { storeName: string; importName: string },
): void {
  const mainPath = resolve(shellDir, "src", "main.tsx");
  let content = readFileSync(mainPath, "utf-8");

  // Add import after other store imports
  const storeImports = content
    .split("\n")
    .filter((line: string) => /^import \{.*\} from '\.\/stores\//.test(line));
  const lastStoreImport = storeImports[storeImports.length - 1];

  if (lastStoreImport) {
    content = content.replace(
      lastStoreImport,
      `${lastStoreImport}\nimport { ${params.importName} } from './stores/${params.storeName}.js'`,
    );
  }

  // Add to stores object in createRegistry
  const storesMatch = content.match(/stores:\s*\{([^}]+)\}/);
  if (storesMatch) {
    const currentStores = storesMatch[1].trim();
    content = content.replace(
      storesMatch[0],
      `stores: { ${currentStores}, ${params.storeName}: ${params.importName} }`,
    );
  }

  writeFileSync(mainPath, content);
}
