import type {
  AppSharedPackageJsonParams,
  JourneyTemplateParams,
  ModulePackageJsonParams,
  RootPackageJsonParams,
  ShellPackageJsonParams,
} from "@modular-react/cli-core";

/**
 * Versions the Vue CLI bakes into generated `package.json` files. Centralized
 * so a single bump propagates to every template — the Vue analog of
 * `cli-core`'s `RUNTIME_VERSIONS`.
 */
/**
 * Version range for the `@modular-vue/*` family (core, runtime, vue, testing,
 * journeys). Exported so the preset can pin the shell's direct
 * `@modular-vue/journeys` dep to the same range the generated journey packages
 * use, keeping them in sync from one source.
 */
export const MODULAR_VUE_VERSION = "^1.0.0";

const V = {
  /** `@modular-vue/*` family (core, runtime, vue, testing, journeys). */
  modularVue: MODULAR_VUE_VERSION,
  /** `@modular-frontend/*` shared engine/core — one open range across the pre-2.0 line so a generated app is never pinned off the latest (e.g. panels landed in 0.4). */
  modularFrontend: ">=0.1.0 <2.0.0",
  vue: "^3.5.0",
  vueRouter: "^5.0.0",
  vueTsc: "^3.3.0",
  vitePluginVue: "^6.0.0",
  vite: "^8.1.3",
  typescript: "^6.0.2",
  vitest: "^4.1.0",
  vueTestUtils: "^2.4.6",
  happyDom: "^15.0.0",
  wretch: "^2.11.0",
} as const;

function sortObject<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

export function rootPackageJson(params: RootPackageJsonParams): string {
  return JSON.stringify(
    {
      name: params.name,
      version: "1.0.0",
      private: true,
      scripts: {
        build: "pnpm -r run build",
        dev: "pnpm --filter shell dev",
        test: "vitest run",
        typecheck: "pnpm -r run typecheck",
      },
      devDependencies: {
        "@vitejs/plugin-vue": V.vitePluginVue,
        "@vue/test-utils": V.vueTestUtils,
        "happy-dom": V.happyDom,
        typescript: V.typescript,
        vitest: V.vitest,
        vue: V.vue,
      },
    },
    null,
    2,
  );
}

export function rootVitestConfig(): string {
  return `import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Module tests render Vue SFCs (via @modular-vue/testing's renderModule), so
// Vitest needs @vitejs/plugin-vue to transform \`.vue\` imports. \`happy-dom\`
// gives the tests a DOM; individual test files may override the environment
// with a \`// @vitest-environment\` directive.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
  },
})
`;
}

export function tsconfigBase(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "bundler",
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
      },
    },
    null,
    2,
  );
}

export function modulePackageJson(params: ModulePackageJsonParams): string {
  return JSON.stringify(
    {
      name: `${params.scope}/${params.name}-module`,
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
        typecheck: "vue-tsc --noEmit",
      },
      dependencies: {
        "@modular-frontend/core": V.modularFrontend,
        "@modular-vue/core": V.modularVue,
        [`${params.scope}/app-shared`]: "workspace:*",
      },
      peerDependencies: {
        vue: V.vue,
        "vue-router": V.vueRouter,
      },
      devDependencies: {
        "@modular-vue/testing": V.modularVue,
        "@vue/test-utils": V.vueTestUtils,
        "happy-dom": V.happyDom,
        typescript: V.typescript,
        vitest: V.vitest,
        vue: V.vue,
        "vue-router": V.vueRouter,
        "vue-tsc": V.vueTsc,
      },
    },
    null,
    2,
  );
}

export function moduleTsconfig(): string {
  return JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      include: ["src"],
    },
    null,
    2,
  );
}

export function shellPackageJson(params: ShellPackageJsonParams): string {
  return JSON.stringify(
    {
      name: "shell",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
        typecheck: "vue-tsc --noEmit",
      },
      dependencies: {
        "@modular-frontend/core": V.modularFrontend,
        "@modular-vue/core": V.modularVue,
        "@modular-vue/runtime": V.modularVue,
        "@modular-vue/vue": V.modularVue,
        [`${params.scope}/app-shared`]: "workspace:*",
        [`${params.scope}/${params.moduleName}-module`]: "workspace:*",
        wretch: V.wretch,
        vue: V.vue,
        "vue-router": V.vueRouter,
      },
      devDependencies: {
        "@vitejs/plugin-vue": V.vitePluginVue,
        typescript: V.typescript,
        vite: V.vite,
        "vue-tsc": V.vueTsc,
      },
    },
    null,
    2,
  );
}

export function shellTsconfig(): string {
  return JSON.stringify(
    {
      extends: "../tsconfig.base.json",
      include: ["src"],
      compilerOptions: {
        noEmit: true,
        types: ["vite/client"],
      },
    },
    null,
    2,
  );
}

export function appSharedPackageJson(params: AppSharedPackageJsonParams): string {
  const dependencies = {
    "@modular-frontend/core": V.modularFrontend,
    "@modular-vue/vue": V.modularVue,
    wretch: V.wretch,
  };
  const peerDependencies = {
    vue: V.vue,
    "vue-router": V.vueRouter,
  };
  const devDependencies = {
    typescript: V.typescript,
    vue: V.vue,
    "vue-router": V.vueRouter,
    "vue-tsc": V.vueTsc,
  };

  return JSON.stringify(
    {
      name: `${params.scope}/app-shared`,
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
        typecheck: "vue-tsc --noEmit",
      },
      dependencies: sortObject(dependencies),
      peerDependencies: sortObject(peerDependencies),
      devDependencies: sortObject(devDependencies),
    },
    null,
    2,
  );
}

export function appSharedTsconfig(): string {
  return JSON.stringify(
    {
      extends: "../tsconfig.base.json",
      include: ["src"],
    },
    null,
    2,
  );
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
        typecheck: "vue-tsc --noEmit",
      },
      dependencies: {
        "@modular-vue/journeys": V.modularVue,
        [`${params.scope}/app-shared`]: "workspace:*",
        ...moduleDeps,
      },
      devDependencies: {
        typescript: V.typescript,
        vue: V.vue,
        "vue-tsc": V.vueTsc,
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
