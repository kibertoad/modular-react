export function shellPackageJson(params: { scope: string; moduleName: string }): string {
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
        "@tanstack-react-modules/core": "^2.0.0",
        "@tanstack-react-modules/runtime": "^2.0.0",
        [`${params.scope}/app-shared`]: "workspace:*",
        [`${params.scope}/${params.moduleName}-module`]: "workspace:*",
        "@lokalise/frontend-http-client": "^7.0.0",
        wretch: "^2.11.0",
        "@tanstack/react-query": "^5.95.0",
        "@tanstack/react-router": "^1.120.0",
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

export function shellViteConfig(): string {
  return `import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-router', '@tanstack/react-query', 'zustand'],
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

export function shellMain(params: {
  scope: string;
  moduleName: string;
  importName: string;
}): string {
  return `import { createRoot } from 'react-dom/client'
import { createRegistry } from '@tanstack-react-modules/runtime'
import type { AppDependencies, AppSlots } from '${params.scope}/app-shared'
import ${params.importName} from '${params.scope}/${params.moduleName}-module'
import { authStore } from './stores/auth.js'
import { configStore } from './stores/config.js'
import { httpClient } from './services/http-client.js'
import { RootLayout } from './components/RootLayout.js'
import { ShellLayout } from './components/ShellLayout.js'
import { Home } from './components/Home.js'

// Create the registry with shared dependencies
const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore, config: configStore },
  services: { httpClient },
  reactiveServices: {},
  slots: { commands: [] },
})

// Register modules
registry.register(${params.importName})

// Resolve — validates everything and produces the app.
//
// Layout split:
//   RootLayout  — runs for every route (public + protected). Use for observability.
//   ShellLayout — renders the authenticated chrome (sidebar, header, detail panel).
//
// Auth guard is a no-op TODO. Replace \`beforeLoad\` with a real check and uncomment
// \`shellRoutes\` to expose public pages like /login. See:
//   https://github.com/kibertoad/modular-react/blob/main/docs/shell-patterns-tanstack-router.md
const { App } = registry.resolve({
  rootComponent: RootLayout,
  indexComponent: Home,

  authenticatedRoute: {
    beforeLoad: () => {
      // TODO: replace with real auth check. Example:
      //   const { isAuthenticated } = authStore.getState()
      //   if (!isAuthenticated) throw redirect({ to: '/login' })
    },
    component: ShellLayout,
  },

  // shellRoutes: (root) => [
  //   createRoute({ getParentRoute: () => root, path: '/login', component: LoginPage }),
  // ],
})

createRoot(document.getElementById('root')!).render(<App />)
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

export function shellRootLayout(): string {
  return `import { Outlet } from '@tanstack/react-router'

// The root layout renders for every route — public or protected.
// It's the place for app-wide concerns that must run even on public pages:
// analytics, feature flags, error reporting, global providers that don't
// depend on authentication.
//
// The authenticated chrome (sidebar, header, detail panel) lives in
// ShellLayout, which is mounted via \`authenticatedRoute.component\`.
export function RootLayout() {
  // TODO: Add observability / analytics here. For example:
  //   useRouterState() + track page view
  return <Outlet />
}
`;
}

export function shellShellLayout(params: { scope: string }): string {
  return `import { Outlet } from '@tanstack/react-router'
import { useSlots, useZones } from '@tanstack-react-modules/runtime'
import { useStore } from '${params.scope}/app-shared'
import type { AppSlots, AppZones } from '${params.scope}/app-shared'
import { Sidebar } from './Sidebar.js'

// The authenticated shell chrome. Rendered under the \`authenticatedRoute\`
// layout in main.tsx — everything below this layout has (conceptually)
// cleared the auth guard.
//
// This is also where cross-cutting module contributions get rendered:
//   - \`useSlots().commands\` — the action bar in the header
//   - \`useZones<AppZones>().detailPanel\` — the right-hand detail panel
export function ShellLayout() {
  const user = useStore('auth', (s) => s.user)
  const isAuthenticated = useStore('auth', (s) => s.isAuthenticated)
  const login = useStore('auth', (s) => s.login)
  const logout = useStore('auth', (s) => s.logout)
  const { commands } = useSlots<AppSlots>()
  const zones = useZones<AppZones>()
  const DetailPanel = zones.detailPanel

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {/* Commands contributed by modules via slots.commands */}
          {commands.map((cmd) => (
            <button
              key={cmd.id}
              onClick={cmd.onSelect}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #e2e8f0',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              {cmd.label}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {isAuthenticated ? (
              <>
                <span style={{ color: '#4a5568' }}>{user?.name}</span>
                <button
                  onClick={logout}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #e2e8f0',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => login({ email: 'demo@example.com', password: 'demo' })}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  backgroundColor: '#3182ce',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Login as Demo User
              </button>
            )}
          </div>
        </header>
        <div style={{ flex: 1, display: 'flex' }}>
          <main style={{ flex: 1, padding: '1.5rem' }}>
            <Outlet />
          </main>
          {DetailPanel && (
            <aside style={{
              width: '320px',
              borderLeft: '1px solid #e2e8f0',
              padding: '1.5rem',
              backgroundColor: '#f7fafc',
            }}>
              <DetailPanel />
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
`;
}

export function shellSidebar(params: { projectName: string }): string {
  return `import { Link, useLocation } from '@tanstack/react-router'
import { useNavigation } from '@tanstack-react-modules/runtime'

export function Sidebar() {
  const navigation = useNavigation()
  const location = useLocation()

  return (
    <aside style={{
      width: '240px',
      minHeight: '100vh',
      borderRight: '1px solid #e2e8f0',
      padding: '1rem',
      backgroundColor: '#f7fafc',
    }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: '#2d3748' }}>
        ${params.projectName}
      </h1>

      <nav>
        <Link
          to="/"
          style={{
            display: 'block',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            color: location.pathname === '/' ? '#2b6cb0' : '#4a5568',
            backgroundColor: location.pathname === '/' ? '#ebf8ff' : 'transparent',
            marginBottom: '0.25rem',
          }}
        >
          Home
        </Link>

        {navigation.groups.map((group) => (
          <div key={group.group} style={{ marginTop: '1rem' }}>
            <h3 style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#a0aec0',
              marginBottom: '0.5rem',
              padding: '0 0.75rem',
            }}>
              {group.group}
            </h3>
            {group.items
              .filter((item) => !item.hidden)
              .map((item) => {
                const isActive = location.pathname.startsWith(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      display: 'block',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      textDecoration: 'none',
                      color: isActive ? '#2b6cb0' : '#4a5568',
                      backgroundColor: isActive ? '#ebf8ff' : 'transparent',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
          </div>
        ))}

        {navigation.ungrouped.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            {navigation.ungrouped
              .filter((item) => !item.hidden)
              .map((item) => {
                const isActive = location.pathname.startsWith(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      display: 'block',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      textDecoration: 'none',
                      color: isActive ? '#2b6cb0' : '#4a5568',
                      backgroundColor: isActive ? '#ebf8ff' : 'transparent',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
          </div>
        )}
      </nav>
    </aside>
  )
}
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
