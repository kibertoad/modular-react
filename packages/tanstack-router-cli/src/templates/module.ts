import type {
  ModuleDescriptorParams,
  ModuleDetailPanelParams,
  ModuleListPageParams,
  ModulePageParams,
  ModuleTestParams,
} from "@modular-react/cli-core";

export function moduleDescriptor(params: ModuleDescriptorParams): string {
  const label = capitalize(params.name);
  const navItems = params.navGroup
    ? [
        `{ label: '${label}', to: '/${params.route}', group: '${params.navGroup}', order: 10 }`,
        `{ label: '${label} List', to: '/${params.route}/list', group: '${params.navGroup}', order: 11 }`,
      ]
    : [
        `{ label: '${label}', to: '/${params.route}', order: 10 }`,
        `{ label: '${label} List', to: '/${params.route}/list', order: 11 }`,
      ];

  return `import { defineModule } from '@tanstack-react-modules/core'
import { createRoute, lazyRouteComponent } from '@tanstack/react-router'
import type { AppDependencies, AppSlots } from '${params.scope}/app-shared'
import { ${label}DetailPanel } from './panels/DetailPanel.js'

export default defineModule<AppDependencies, AppSlots>({
  id: '${params.name}',
  version: '0.1.0',

  // Catalog metadata — the shell discovers modules via useModules() + getModuleMeta()
  meta: {
    name: '${label}',
    description: '${label} module',
    category: 'general',
  },

  createRoutes: (parentRoute) => {
    const root = createRoute({
      getParentRoute: () => parentRoute,
      path: '${params.route}',
    })

    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: lazyRouteComponent(() => import('./pages/${params.pageName}.js')),
    })

    const list = createRoute({
      getParentRoute: () => root,
      path: 'list',
      component: lazyRouteComponent(() => import('./pages/${params.listPageName}.js')),
      // Route zone — the shell renders this in its detail panel slot while this route is active.
      // Typed via the AppZones augmentation in app-shared.
      staticData: {
        detailPanel: ${label}DetailPanel,
      },
    })

    return root.addChildren([index, list])
  },

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
  return `// Rendered by the shell in its detail-panel zone when the list route is active.
// See the module descriptor's \`staticData: { detailPanel: ... }\` for the wiring.
export function ${params.moduleLabel}DetailPanel() {
  return (
    <div>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.5rem' }}>
        ${params.moduleLabel} details
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#718096' }}>
        This panel is contributed by the ${params.moduleLabel.toLowerCase()} module via a route zone.
      </p>
    </div>
  )
}
`;
}

export function modulePage(params: ModulePageParams): string {
  return `import { useStore } from '${params.scope}/app-shared'
import { Link } from '@tanstack/react-router'

export default function ${params.pageName}() {
  const user = useStore('auth', (s) => s.user)

  return (
    <div>
      <h2>${params.moduleLabel}</h2>
      {user ? (
        <p>Welcome, {user.name}.</p>
      ) : (
        <p>Please log in to continue.</p>
      )}
      <nav>
        <Link to="/${params.moduleName}/list">
          View ${params.moduleLabel} List
        </Link>
      </nav>
    </div>
  )
}
`;
}

export function moduleListPage(params: ModuleListPageParams): string {
  return `import { useStore } from '${params.scope}/app-shared'

export default function ${params.pageName}() {
  const user = useStore('auth', (s) => s.user)

  return (
    <div>
      <h2>${params.moduleLabel} List</h2>
      {user ? (
        <p>Showing items for {user.name}.</p>
      ) : (
        <p>Please log in to view the list.</p>
      )}
    </div>
  )
}
`;
}

export function moduleTest(params: ModuleTestParams): string {
  return `import { describe, it, expect } from 'vitest'
import { renderModule, createMockStore } from '@tanstack-react-modules/testing'
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
    const { getByText } = await renderModule(${params.importName}, {
      route: '/${params.route}',
      deps: { auth: mockAuth, config: mockConfig },
    })

    expect(getByText('${capitalize(params.name)}')).toBeDefined()
  })

  it('renders the list page', async () => {
    const { getByText } = await renderModule(${params.importName}, {
      route: '/${params.route}/list',
      deps: { auth: mockAuth, config: mockConfig },
    })

    expect(getByText('${capitalize(params.name)} List')).toBeDefined()
  })
})
`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
