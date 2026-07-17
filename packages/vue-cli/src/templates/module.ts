import type {
  ModuleDescriptorParams,
  ModuleDetailPanelParams,
  ModuleListPageParams,
  ModulePageParams,
  ModuleTestParams,
} from "@modular-react/cli-core";

export function moduleDescriptor(params: ModuleDescriptorParams): string {
  const label = params.moduleLabel;
  const navItems = params.navGroup
    ? [
        `{ label: '${label}', to: '/${params.route}', group: '${params.navGroup}', order: 10 }`,
        `{ label: '${label} List', to: '/${params.route}/list', group: '${params.navGroup}', order: 11 }`,
      ]
    : [
        `{ label: '${label}', to: '/${params.route}', order: 10 }`,
        `{ label: '${label} List', to: '/${params.route}/list', order: 11 }`,
      ];

  return `import { defineModule } from '@modular-vue/core'
import type { RouteRecordRaw } from 'vue-router'
import type { AppDependencies, AppSlots, AppZones } from '${params.scope}/app-shared'
import ${label}DetailPanel from './panels/DetailPanel.vue'

export default defineModule<AppDependencies, AppSlots>({
  id: '${params.name}',
  version: '0.1.0',

  // Catalog metadata — the shell discovers modules via useModules() + getModuleMeta()
  meta: {
    name: '${label}',
    description: '${label} module',
    category: 'general',
  },

  // A vue-router subtree. The runtime grafts it onto the router via
  // \`router.addRoute()\`. The parent has no component, so each child renders in
  // the shell's <router-view>. The parent path is absolute so the subtree also
  // resolves when a test mounts it in isolation (\`renderModule\`); grafted under
  // the shell's named "root" route, an absolute child still renders inside its
  // <router-view>.
  createRoutes: (): RouteRecordRaw => ({
    path: '/${params.route}',
    children: [
      {
        path: '',
        component: () => import('./pages/${params.pageName}.vue'),
      },
      {
        path: 'list',
        component: () => import('./pages/${params.listPageName}.vue'),
        // Route zone — the shell renders this in its detail panel while this
        // route is active. \`meta\` is vue-router's per-route data channel, typed
        // against AppZones via the RouteMeta augmentation in app-shared.
        meta: { detailPanel: ${label}DetailPanel } satisfies AppZones,
      },
    ],
  }),

  navigation: [
    ${navItems.join(",\n    ")},
  ],

  // Commands aggregated into the shell's command palette / action bar
  slots: {
    commands: [
      {
        id: '${params.name}:refresh',
        label: 'Refresh ${label}',
        group: 'actions',
        onSelect: () => window.location.reload(),
      },
    ],
  },

  // To compose this module into a multi-step flow, declare entry/exit
  // contracts here (defineEntry / defineExit) and feed them into a journey
  // — see packages/journeys/README.md and \`create journey\`.
  // entryPoints: { ... },
  // exitPoints: { ... },

  requires: ['auth'],
})
`;
}

export function moduleDetailPanel(params: ModuleDetailPanelParams): string {
  return `<script setup lang="ts"></script>

<template>
  <!--
    Rendered by the shell in its detail-panel zone when the list route is active.
    See the module descriptor's \`meta: { detailPanel: ... }\` for the wiring.
  -->
  <div>
    <h3 :style="{ fontSize: '0.875rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.5rem' }">
      ${params.moduleLabel} details
    </h3>
    <p :style="{ fontSize: '0.875rem', color: '#718096' }">
      This panel is contributed by the ${params.moduleLabel.toLowerCase()} module via a route zone.
    </p>
  </div>
</template>
`;
}

export function modulePage(params: ModulePageParams): string {
  return `<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useStore } from '${params.scope}/app-shared'

const user = useStore('auth', (s) => s.user)
</script>

<template>
  <div>
    <h2>${params.moduleLabel}</h2>
    <p v-if="user">Welcome, {{ user?.name }}.</p>
    <p v-else>Please log in to continue.</p>
    <nav>
      <RouterLink to="/${params.moduleName}/list">View ${params.moduleLabel} List</RouterLink>
    </nav>
  </div>
</template>
`;
}

export function moduleListPage(params: ModuleListPageParams): string {
  return `<script setup lang="ts">
import { useStore } from '${params.scope}/app-shared'

const user = useStore('auth', (s) => s.user)
</script>

<template>
  <div>
    <h2>${params.moduleLabel} List</h2>
    <p v-if="user">Showing items for {{ user?.name }}.</p>
    <p v-else>Please log in to view the list.</p>
  </div>
</template>
`;
}

export function moduleTest(params: ModuleTestParams): string {
  return `// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { renderModule, createMockStore } from '@modular-vue/testing'
import type { AppDependencies } from '${params.scope}/app-shared'
import ${params.importName} from '../index.js'

const mockAuth = createMockStore<AppDependencies['auth']>({
  user: { id: 'usr-001', name: 'Test User', email: 'test@example.com', role: 'admin' },
  token: 'mock-token',
  isAuthenticated: true,
  login: async () => {},
  logout: () => {},
})

const mockConfig = createMockStore<AppDependencies['config']>({
  apiBaseUrl: 'http://localhost:3000/api',
  environment: 'dev',
  appName: 'Test',
})

describe('${params.name} module', () => {
  it('renders the index page', async () => {
    const wrapper = await renderModule(${params.importName}, {
      route: '/${params.route}',
      deps: { auth: mockAuth, config: mockConfig },
    })

    // \`renderModule\` returns a @vue/test-utils wrapper. Querying by label +
    // asserting on rendered text avoids the dashed-name mismatch that bit a
    // previous version of the React template.
    expect(wrapper.text()).toContain('${params.moduleLabel}')
  })

  it('renders the list page', async () => {
    const wrapper = await renderModule(${params.importName}, {
      route: '/${params.route}/list',
      deps: { auth: mockAuth, config: mockConfig },
    })

    expect(wrapper.text()).toContain('${params.moduleLabel} List')
  })
})
`;
}
