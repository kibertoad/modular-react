import type { IntegrationConfig } from "./integrations.js";

export interface IntegrationManagerProps {
  readonly config: IntegrationConfig;
}

/**
 * Generic integration-manager screen. Every sibling integration module
 * renders this with its own `IntegrationConfig`. The component knows nothing
 * about specific integrations — it reads typed config fields and renders.
 *
 * Adding a new integration = adding a new module with its own config. Adding
 * a new capability = adding a new field to IntegrationFeatures and a branch
 * here. No per-integration branching.
 */
export function IntegrationManager({ config }: IntegrationManagerProps) {
  return (
    <section>
      <header>
        <h1>{config.displayName}</h1>
        <p>Configure and manage content from {config.displayName}.</p>
      </header>

      <table>
        <thead>
          <tr>
            {config.columns.map((col) => (
              <th key={col.id}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {config.columns.map((col) => (
              <td key={col.id}>
                <em>{col.type} column</em>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {config.features.allowAssigningLanguagesToFolders ? (
        <section>
          <h2>Language / folder assignment</h2>
          <p>Map languages to folders in the source.</p>
        </section>
      ) : null}

      {config.features.limitImportToOnlyBaseLanguage ? (
        <p role="note">Imports are limited to the base language for this integration.</p>
      ) : null}

      {config.features.supportedImportTags?.length ? (
        <section>
          <h2>Available import tags</h2>
          <ul>
            {config.features.supportedImportTags.map((tag) => (
              <li key={tag.id}>{tag.title}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
