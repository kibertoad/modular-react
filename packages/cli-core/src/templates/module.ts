import type { CliPreset } from "../preset.js";

export function modulePackageJson(params: {
  scope: string;
  name: string;
  preset: CliPreset;
}): string {
  const { router, routerVersion, core } = params.preset.packages;

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
      dependencies: {
        "@modular-react/core": "^1.0.0",
        [core]: "^2.0.0",
        [`${params.scope}/app-shared`]: "workspace:*",
        "@lokalise/frontend-http-client": "^7.0.0",
      },
      peerDependencies: {
        "@tanstack/react-query": "^5.95.0",
        [router]: routerVersion,
        react: "^19.0.0",
        zustand: "^5.0.0",
      },
      devDependencies: {
        "@tanstack/react-query": "^5.95.0",
        [router]: routerVersion,
        react: "^19.0.0",
        zustand: "^5.0.0",
        "@types/react": "^19.0.0",
        typescript: "^6.0.2",
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
