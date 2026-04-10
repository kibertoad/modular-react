export function appSharedPackageJson(params: { scope: string }): string {
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
      dependencies: {
        "@modular-react/core": "^1.0.0",
        "@tanstack-react-modules/core": "^2.0.0",
        "@lokalise/api-contracts": "^6.0.0",
        "@lokalise/frontend-http-client": "^7.0.0",
        wretch: "^2.11.0",
        zod: "^3.25.0",
      },
      peerDependencies: {
        // Required so app-shared can augment `@tanstack/router-core`'s
        // `StaticDataRouteOption` interface with AppZones.
        "@tanstack/router-core": "^1.120.0",
        react: "^19.0.0",
        zustand: "^5.0.0",
      },
      devDependencies: {
        "@tanstack/router-core": "^1.120.0",
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

export function appSharedIndex(_params: { scope: string }): string {
  return `import { createSharedHooks } from '@tanstack-react-modules/core'
import type { ComponentType } from 'react'
import type { LoginCredentials, User } from './types.js'
import type { Wretch } from 'wretch'

export type { User, LoginCredentials } from './types.js'

// ---- Zustand store shapes (reactive / client state) ----

export interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
}

export interface ConfigStore {
  apiBaseUrl: string
  environment: 'dev' | 'staging' | 'prod'
  appName: string
}

// ---- The contract ----

export interface AppDependencies {
  // Zustand stores (reactive client state)
  auth: AuthStore
  config: ConfigStore
  // Wretch instance for making HTTP calls via @lokalise/frontend-http-client
  httpClient: Wretch
}

// ---- Slots (static contributions from every module) ----

export interface CommandDefinition {
  readonly id: string
  readonly label: string
  readonly group?: string
  readonly icon?: string
  readonly onSelect: () => void
}

export interface AppSlots {
  commands: CommandDefinition[]
}

// ---- Zones (per-route layout regions a module can fill) ----
// Declared on a route's \`staticData\` and read by the shell via \`useZones<AppZones>()\`.

export interface AppZones {
  detailPanel?: ComponentType
  headerActions?: ComponentType
}

// Type-safe staticData: tells TanStack Router that createRoute({ staticData: { ... } })
// should accept \`AppZones\` keys with compile-time checking.
// The empty import ensures TypeScript loads the target module before we augment it.
import type {} from '@tanstack/router-core'
declare module '@tanstack/router-core' {
  interface StaticDataRouteOption extends AppZones {}
}

// ---- Typed hooks (use these in all modules) ----

export const { useStore, useService, useReactiveService, useOptional } = createSharedHooks<AppDependencies>()
`;
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
