/**
 * Feature flags an integration can toggle. Flat bag of primitives — booleans,
 * numbers, small arrays. Shared across all integrations so the Integration
 * Manager can check them uniformly without knowing which integration is
 * active.
 */
export interface IntegrationFeatures {
  readonly allowAssigningLanguagesToFolders?: boolean;
  readonly limitImportToOnlyBaseLanguage?: boolean;
  readonly showSkipEmptyOptionOnImport?: boolean;
  readonly maxBatchSize?: number;
  readonly supportedImportTags?: readonly ImportTag[];
}

export interface ImportTag {
  readonly id: string;
  readonly title: string;
}

export interface ColumnDefinition {
  readonly id: string;
  readonly title: string;
  readonly type: "string" | "date" | "number";
}

/**
 * The full per-integration config each integration module constructs and
 * passes to `<IntegrationManager>`. The same object is mirrored onto the
 * route's `handle` so shell zones can read it via `useRouteData`.
 */
export interface IntegrationConfig {
  readonly id: string;
  readonly displayName: string;
  readonly features: IntegrationFeatures;
  readonly columns: readonly ColumnDefinition[];
}
