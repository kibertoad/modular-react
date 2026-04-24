import { useRouteData } from "@tanstack-react-modules/runtime";
import type { AppRouteData } from "@example-tsr-integration-manager/app-shared";

/**
 * Reads the active route's staticData via the typed generic. Branches only
 * on typed feature flags — never on integration id. Adding a fourth
 * integration doesn't touch this file.
 */
export function HeaderCommands() {
  const { integration, pageTitle } = useRouteData<AppRouteData>();

  if (!integration) {
    return <h2 style={{ margin: 0 }}>Welcome</h2>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <h2 style={{ margin: 0 }}>{pageTitle ?? integration.displayName}</h2>

      {integration.features.allowAssigningLanguagesToFolders ? (
        <button type="button">Assign languages to folders…</button>
      ) : null}

      {integration.features.limitImportToOnlyBaseLanguage ? (
        <button type="button">Import base language only</button>
      ) : null}

      {integration.features.showSkipEmptyOptionOnImport ? (
        <label>
          <input type="checkbox" /> Skip empty on import
        </label>
      ) : null}

      {typeof integration.features.maxBatchSize === "number" ? (
        <span aria-label="Max batch size">Batch: {integration.features.maxBatchSize}</span>
      ) : null}
    </div>
  );
}
