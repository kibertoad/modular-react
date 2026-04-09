export function modulePackageJson(params: { scope: string; name: string }): string {
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
        "@react-router-modules/core": "^0.1.0",
        [`${params.scope}/app-shared`]: "workspace:*",
        "@lokalise/frontend-http-client": "^7.0.0",
      },
      peerDependencies: {
        "@tanstack/react-query": "^5.95.0",
        "react-router": "^7.6.0",
        react: "^19.0.0",
        zustand: "^5.0.0",
      },
      devDependencies: {
        "@tanstack/react-query": "^5.95.0",
        "react-router": "^7.6.0",
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

export function moduleDescriptor(params: {
  scope: string;
  name: string;
  route: string;
  pageName: string;
  listPageName: string;
  navGroup?: string;
}): string {
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

  return `import { defineModule } from '@react-router-modules/core'
import type { RouteObject } from 'react-router'
import type { AppDependencies, AppSlots, AppZones } from '${params.scope}/app-shared'
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

  createRoutes: (): RouteObject => ({
    path: '${params.route}',
    children: [
      {
        index: true,
        lazy: () => import('./pages/${params.pageName}.js').then((m) => ({ Component: m.default })),
      },
      {
        path: 'list',
        lazy: () => import('./pages/${params.listPageName}.js').then((m) => ({ Component: m.default })),
        // Route zone — the shell renders this in its detail panel slot while this route is active.
        handle: { detailPanel: ${label}DetailPanel } satisfies AppZones,
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

  requires: ['auth'],
})
`;
}

export function moduleDetailPanel(params: { moduleLabel: string }): string {
  return `// Rendered by the shell in its detail-panel zone when the list route is active.
// See the module descriptor's \`handle: { detailPanel: ... }\` for the wiring.
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

export function modulePage(params: {
  scope: string;
  pageName: string;
  moduleLabel: string;
  moduleName: string;
}): string {
  return `import { useStore } from '${params.scope}/app-shared'
import { Link } from 'react-router'

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

export function moduleListPage(params: {
  scope: string;
  pageName: string;
  moduleLabel: string;
}): string {
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

export function moduleTest(params: {
  scope: string;
  name: string;
  importName: string;
  route: string;
  pageName: string;
}): string {
  return `import { describe, it, expect } from 'vitest'
import { renderModule, createMockStore } from '@react-router-modules/testing'
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
