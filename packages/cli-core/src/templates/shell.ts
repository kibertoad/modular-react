import type { CliPreset } from "../preset.js";
import { RUNTIME_VERSIONS } from "../runtime-versions.js";

export function shellPackageJson(params: {
  scope: string;
  moduleName: string;
  preset: CliPreset;
}): string {
  const { core, runtime, router, routerVersion } = params.preset.packages;

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
      },
      dependencies: {
        "@modular-react/core": RUNTIME_VERSIONS.core,
        "@modular-react/react": RUNTIME_VERSIONS.react,
        [core]: "^2.0.0",
        [runtime]: "^2.0.0",
        [`${params.scope}/app-shared`]: "workspace:*",
        [`${params.scope}/${params.moduleName}-module`]: "workspace:*",
        "@lokalise/frontend-http-client": "^7.0.0",
        wretch: "^2.11.0",
        "@tanstack/react-query": "^5.95.0",
        [router]: routerVersion,
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        zustand: "^5.0.0",
      },
      devDependencies: {
        "@rolldown/plugin-babel": "^0.2.2",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^6.0.1",
        "babel-plugin-react-compiler": "^1.0.0",
        typescript: "^6.0.2",
        vite: "^8.0.3",
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
      },
    },
    null,
    2,
  );
}

export function shellHttpClient(): string {
  return `import wretch from 'wretch'
import { authStore } from '../stores/auth.js'
import { configStore } from '../stores/config.js'

export const httpClient = wretch()
  .defer((w) => {
    const { apiBaseUrl } = configStore.getState()
    const { token } = authStore.getState()
    let instance = w.url(apiBaseUrl)
    if (token) {
      instance = instance.auth(\`Bearer \${token}\`)
    }
    return instance
  })
`;
}
