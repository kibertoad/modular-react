import type { AppSharedIndexParams } from "@modular-react/cli-core";

export function appSharedIndex(_params: AppSharedIndexParams): string {
  return `import { createSharedComposables } from '@modular-vue/vue'
import type {} from 'vue-router'
import type { UiComponent } from '@modular-frontend/core'
import type { LoginCredentials, User } from './types.js'
import type { Wretch } from 'wretch'

export type { User, LoginCredentials } from './types.js'

// ---- Store shapes (reactive / client state) ----

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
  // Reactive client state (framework core stores — see shell/src/stores)
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
// Declared on a route's \`meta\` and read by the shell via \`useZones<AppZones>()\`.

export interface AppZones {
  detailPanel?: UiComponent
  headerActions?: UiComponent
}

// ---- Typed route data (per-route static data, read via useRouteData) ----

export interface AppRouteData {
  pageTitle?: string
}

// ---- Typed \`meta\` augmentation ----
// vue-router exposes a single global \`RouteMeta\` interface as the formal
// augmentation point. Extending it with AppZones + AppRouteData type-checks
// \`meta: { ... }\` on every route against the app's shape. This lives in
// app-shared (not a library) because \`RouteMeta\` is global.

declare module 'vue-router' {
  interface RouteMeta extends AppZones, AppRouteData {}
}

// ---- Typed composables (use these in all modules) ----

export const { useStore, useService, useReactiveService, useOptional } =
  createSharedComposables<AppDependencies>()
`;
}
