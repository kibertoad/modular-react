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

export interface IntegrationConfig {
  readonly id: string;
  readonly displayName: string;
  readonly features: IntegrationFeatures;
  readonly columns: readonly ColumnDefinition[];
}
