export function rootPackageJson(params: { name: string }): string {
  return JSON.stringify(
    {
      name: params.name,
      version: "1.0.0",
      private: true,
      scripts: {
        build: "pnpm -r run build",
        dev: "pnpm --filter shell dev",
        test: "vitest run",
        typecheck: "tsc --build",
      },
      devDependencies: {
        typescript: "^6.0.2",
        vitest: "^4.1.0",
      },
    },
    null,
    2,
  );
}

export function pnpmWorkspace(): string {
  return `packages:
  - app-shared
  - shell
  - modules/*

onlyBuiltDependencies:
  - esbuild
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
        jsx: "react-jsx",
        isolatedModules: true,
        verbatimModuleSyntax: true,
      },
    },
    null,
    2,
  );
}

export function tsconfigRoot(): string {
  return JSON.stringify(
    {
      files: [],
      references: [],
    },
    null,
    2,
  );
}

export function gitignore(): string {
  return `node_modules/
dist/
*.tsbuildinfo
.vite/
`;
}
