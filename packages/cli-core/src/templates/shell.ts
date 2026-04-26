import type { CliPreset } from "../preset.js";

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
        "@modular-react/core": "^1.0.0",
        "@modular-react/react": "^1.0.0",
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

export function shellViteConfig(params: { preset: CliPreset }): string {
  const dedupeList = params.preset.templates.shellViteDedupe.map((s) => `'${s}'`).join(", ");
  return `import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    dedupe: [${dedupeList}],
  },
})
`;
}

export function shellIndexHtml(params: { projectName: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${params.projectName}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function shellAuthStore(params: { scope: string }): string {
  return `import { createStore } from 'zustand/vanilla'
import type { AuthStore } from '${params.scope}/app-shared'

export const authStore = createStore<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (credentials) => {
    // TODO: Replace with real API call
    await new Promise((resolve) => setTimeout(resolve, 500))
    set({
      user: {
        id: 'usr-001',
        name: 'Demo User',
        email: credentials.email,
        role: 'admin',
      },
      token: 'mock-jwt-token',
      isAuthenticated: true,
    })
  },

  logout: () => {
    set({ user: null, token: null, isAuthenticated: false })
  },
}))
`;
}

export function shellConfigStore(params: { scope: string; appName: string }): string {
  return `import { createStore } from 'zustand/vanilla'
import type { ConfigStore } from '${params.scope}/app-shared'

export const configStore = createStore<ConfigStore>()(() => ({
  apiBaseUrl: 'http://localhost:3000/api',
  environment: 'dev' as const,
  appName: '${params.appName}',
}))
`;
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

export function shellHome(params: { scope: string }): string {
  return `import { useStore } from '${params.scope}/app-shared'

export function Home() {
  const appName = useStore('config', (s) => s.appName)
  const isAuthenticated = useStore('auth', (s) => s.isAuthenticated)

  return (
    <div>
      <h2>Welcome to {appName}</h2>
      <p>
        {isAuthenticated
          ? 'Use the sidebar to navigate between modules.'
          : 'Click "Login as Demo User" to get started.'}
      </p>
    </div>
  )
}
`;
}
