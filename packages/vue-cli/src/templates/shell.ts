import type {
  ShellMainParams,
  ShellShellLayoutParams,
  ShellSidebarParams,
  ShellIndexHtmlParams,
  ShellAuthStoreParams,
  ShellConfigStoreParams,
  ShellHomeParams,
} from "@modular-react/cli-core";

export function shellMain(params: ShellMainParams): string {
  return `import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createModularApp, createRegistry } from '@modular-vue/runtime'
import type { AppDependencies, AppSlots } from '${params.scope}/app-shared'
import ${params.importName} from '${params.scope}/${params.moduleName}-module'
import { authStore } from './stores/auth.js'
import { configStore } from './stores/config.js'
import { httpClient } from './services/http-client.js'
import RootLayout from './components/RootLayout.vue'
import ShellLayout from './components/ShellLayout.vue'
import Home from './components/Home.vue'

// Create the registry with shared dependencies.
const registry = createRegistry<AppDependencies, AppSlots>({
  stores: { auth: authStore, config: configStore },
  services: { httpClient },
  reactiveServices: {},
  slots: { commands: [] },
})

// Register modules
registry.register(${params.importName})

// The shell owns the router. It declares a layout route at "/" whose nested
// <router-view> hosts module routes; the index child renders Home. Module
// routes are grafted under the named "root" route via \`parentRouteName\`, so
// they render inside ShellLayout next to the sidebar + header chrome.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'root',
      component: ShellLayout,
      children: [{ path: '', name: 'home', component: Home }],
    },
    // Public routes (e.g. /login) live here, OUTSIDE the "root" parent, so the
    // auth guard's redirect target exists. See:
    //   ${params.docsLink}
    // { path: '/login', name: 'login', component: LoginPage },
  ],
})

// \`createModularApp\` resolves the registry and grafts module routes onto the
// router. The returned manifest is itself a Vue plugin.
//
// Auth guard is a no-op TODO. Replace it with a real check and declare a public
// /login route above so the redirect target resolves.
const manifest = createModularApp(registry, {
  router,
  parentRouteName: 'root',

  // authGuard: (to) => {
  //   if (to.meta.public) return true
  //   // The guard runs outside a component, so read the store snapshot directly.
  //   return authStore.getState().isAuthenticated ? true : { name: 'login' }
  // },
})

const app = createApp(RootLayout)
app.use(router)
// Installing the manifest wires the modular contexts (navigation, modules,
// slots, shared deps) app-wide, so every <router-view>-mounted component can
// inject them.
app.use(manifest)
app.mount('#app')
`;
}

export function shellRootLayout(): string {
  return `<script setup lang="ts"></script>

<template>
  <!--
    The app root. Renders for every route — public or protected. It's the place
    for app-wide concerns that must run even on public pages: analytics, feature
    flags, error reporting, global providers that don't depend on auth.

    The authenticated chrome (sidebar, header, detail panel) lives in
    ShellLayout, mounted as the "/" layout route in main.ts.
  -->
  <router-view />
</template>
`;
}

export function shellShellLayout(params: ShellShellLayoutParams): string {
  return `<script setup lang="ts">
import { useSlots, useZones } from '@modular-vue/runtime'
import { useStore } from '${params.scope}/app-shared'
import type { AppSlots, AppZones } from '${params.scope}/app-shared'
import Sidebar from './Sidebar.vue'

// The authenticated shell chrome. Rendered as the "/" layout route in main.ts —
// everything mounted under it has (conceptually) cleared the auth guard.
//
// This is also where cross-cutting module contributions get rendered:
//   - useSlots<AppSlots>().commands — the action bar in the header
//   - useZones<AppZones>().detailPanel — the right-hand detail panel
//
// The store composables return refs; templates auto-unwrap top-level refs.
const user = useStore('auth', (s) => s.user)
const isAuthenticated = useStore('auth', (s) => s.isAuthenticated)
const login = useStore('auth', (s) => s.login)
const logout = useStore('auth', (s) => s.logout)
const slots = useSlots<AppSlots>()
const zones = useZones<AppZones>()
</script>

<template>
  <div :style="{ display: 'flex', minHeight: '100vh' }">
    <Sidebar />
    <div :style="{ flex: 1, display: 'flex', flexDirection: 'column' }">
      <header
        :style="{
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }"
      >
        <!-- Commands contributed by modules via slots.commands -->
        <button
          v-for="cmd in slots.commands"
          :key="cmd.id"
          type="button"
          @click="cmd.onSelect"
          :style="{
            padding: '0.375rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid #e2e8f0',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }"
        >
          {{ cmd.label }}
        </button>

        <div :style="{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }">
          <template v-if="isAuthenticated">
            <span :style="{ color: '#4a5568' }">{{ user?.name }}</span>
            <button
              type="button"
              @click="logout()"
              :style="{
                padding: '0.375rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #e2e8f0',
                backgroundColor: 'white',
                cursor: 'pointer',
              }"
            >
              Logout
            </button>
          </template>
          <button
            v-else
            type="button"
            @click="login({ email: 'demo@example.com', password: 'demo' })"
            :style="{
              padding: '0.375rem 0.75rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: '#3182ce',
              color: 'white',
              cursor: 'pointer',
            }"
          >
            Login as Demo User
          </button>
        </div>
      </header>
      <div :style="{ flex: 1, display: 'flex' }">
        <main :style="{ flex: 1, padding: '1.5rem' }">
          <router-view />
        </main>
        <aside
          v-if="zones.detailPanel"
          :style="{
            width: '320px',
            borderLeft: '1px solid #e2e8f0',
            padding: '1.5rem',
            backgroundColor: '#f7fafc',
          }"
        >
          <component :is="zones.detailPanel" />
        </aside>
      </div>
    </div>
  </div>
</template>
`;
}

export function shellSidebar(params: ShellSidebarParams): string {
  return `<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useNavigation } from '@modular-vue/runtime'

// \`useNavigation()\` returns the resolved navigation manifest — a plain value
// (it's set once at resolve time, so it isn't wrapped in a ref). Its \`.groups\`
// bucket the module-contributed items; the shell owns how they render.
const navigation = useNavigation()
</script>

<template>
  <aside
    :style="{
      width: '240px',
      minHeight: '100vh',
      borderRight: '1px solid #e2e8f0',
      padding: '1rem',
      backgroundColor: '#f7fafc',
    }"
  >
    <h1 :style="{ fontSize: '1.25rem', marginBottom: '1.5rem', color: '#2d3748' }">
      ${params.projectName}
    </h1>

    <nav>
      <RouterLink
        to="/"
        :style="{
          display: 'block',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.375rem',
          textDecoration: 'none',
          color: '#4a5568',
          marginBottom: '0.25rem',
        }"
      >
        Home
      </RouterLink>

      <div v-for="group in navigation.groups" :key="group.group" :style="{ marginTop: '1rem' }">
        <h3
          :style="{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#a0aec0',
            marginBottom: '0.5rem',
            padding: '0 0.75rem',
          }"
        >
          {{ group.group }}
        </h3>
        <RouterLink
          v-for="item in group.items.filter((i) => !i.hidden)"
          :key="item.label"
          :to="typeof item.to === 'string' ? item.to : '#'"
          :style="{
            display: 'block',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            color: '#4a5568',
            marginBottom: '0.25rem',
          }"
        >
          {{ item.label }}
        </RouterLink>
      </div>

      <div v-if="navigation.ungrouped.length > 0" :style="{ marginTop: '1rem' }">
        <RouterLink
          v-for="item in navigation.ungrouped.filter((i) => !i.hidden)"
          :key="item.label"
          :to="typeof item.to === 'string' ? item.to : '#'"
          :style="{
            display: 'block',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            color: '#4a5568',
            marginBottom: '0.25rem',
          }"
        >
          {{ item.label }}
        </RouterLink>
      </div>
    </nav>
  </aside>
</template>
`;
}

export function shellViteConfig(): string {
  return `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'vue-router'],
  },
})
`;
}

export function shellIndexHtml(params: ShellIndexHtmlParams): string {
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
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
}

export function shellAuthStore(params: ShellAuthStoreParams): string {
  return `import { createStore } from '@modular-vue/vue'
import type { AuthStore } from '${params.scope}/app-shared'

// The framework ships a small zustand-shaped \`createStore\` (decision D3) so you
// don't need a state library to get going. Actions call \`authStore.setState\`
// (partial-merged). Swap in a zustand vanilla store or Pinia if you prefer —
// anything exposing getState / setState / subscribe satisfies the contract.
export const authStore = createStore<AuthStore>({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (credentials) => {
    // TODO: Replace with real API call
    await new Promise((resolve) => setTimeout(resolve, 500))
    authStore.setState({
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
    authStore.setState({ user: null, token: null, isAuthenticated: false })
  },
})
`;
}

export function shellConfigStore(params: ShellConfigStoreParams): string {
  return `import { createStore } from '@modular-vue/vue'
import type { ConfigStore } from '${params.scope}/app-shared'

export const configStore = createStore<ConfigStore>({
  apiBaseUrl: 'http://localhost:3000/api',
  environment: 'dev',
  appName: '${params.appName}',
})
`;
}

export function shellHome(params: ShellHomeParams): string {
  return `<script setup lang="ts">
import { useStore } from '${params.scope}/app-shared'

// \`useStore\` returns a Ref; the template auto-unwraps it.
const appName = useStore('config', (s) => s.appName)
const isAuthenticated = useStore('auth', (s) => s.isAuthenticated)
</script>

<template>
  <div>
    <h2>Welcome to {{ appName }}</h2>
    <p>
      {{
        isAuthenticated
          ? 'Use the sidebar to navigate between modules.'
          : 'Click "Login as Demo User" to get started.'
      }}
    </p>
  </div>
</template>
`;
}
