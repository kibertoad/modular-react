import type { CliPreset } from "../preset.js";

export function appSharedPackageJson(params: { scope: string; preset: CliPreset }): string {
  const extra = params.preset.templates.appSharedExtraDeps;
  const dependencies = {
    "@modular-react/core": "^1.0.0",
    [params.preset.packages.core]: "^2.0.0",
    "@lokalise/api-contracts": "^6.0.0",
    "@lokalise/frontend-http-client": "^7.0.0",
    wretch: "^2.11.0",
    zod: "^3.25.0",
    ...(extra?.dependencies ?? {}),
  };
  const peerDependencies = {
    react: "^19.0.0",
    zustand: "^5.0.0",
  };
  const devDependencies = {
    react: "^19.0.0",
    zustand: "^5.0.0",
    "@types/react": "^19.0.0",
    typescript: "^6.0.2",
    ...(extra?.devDependencies ?? {}),
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

export function appSharedTypes(): string {
  return `export interface User {
  id: string
  name: string
  email: string
  role: string
}

export interface LoginCredentials {
  email: string
  password: string
}
`;
}

function sortObject<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
