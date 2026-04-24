import type { IntegrationConfig } from "./integrations.js";

export interface IntegrationManagerProps {
  readonly config: IntegrationConfig;
}

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
