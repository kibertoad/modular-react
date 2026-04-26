import type { AppSharedIndexParams } from "@modular-react/cli-core";

export function appSharedIndex(_params: AppSharedIndexParams): string {
  return `import { createSharedHooks } from '@react-router-modules/core'
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
// Declared on a route's \`handle\` and read by the shell via \`useZones<AppZones>()\`.

export interface AppZones {
  detailPanel?: ComponentType
  headerActions?: ComponentType
}

// ---- Typed hooks (use these in all modules) ----

export const { useStore, useService, useReactiveService, useOptional } = createSharedHooks<AppDependencies>()
`;
}
