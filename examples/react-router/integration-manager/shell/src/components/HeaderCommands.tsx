import { useRouteData } from "@react-router-modules/runtime";
import type { AppRouteData } from "@example-rr-integration-manager/app-shared";

/**
 * Shell zone that adapts to the currently active integration's config.
 * Reads the route handle via the typed generic on useRouteData — no
 * branching on integration id, just typed feature flag checks.
 *
 * The shell knows nothing about Contentful/Strapi/GitHub specifically.
 * Adding a fourth integration changes nothing here: the module declares
 * its features, and this component decides what UI to show based on them.
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
