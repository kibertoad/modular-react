import { ModuleRoute } from "@modular-react/react";
import { Link } from "react-router";
import { launcherModule } from "../launcher-module.js";

/**
 * Router-mode "step 0" — the launcher module renders standalone at /launch.
 * It fires exits through `useModuleExit` which the composition root's
 * `<ModuleExitProvider>` (mounted inside `<JourneyProvider>`) catches and
 * dispatches to the right journey.
 */
export function LaunchPage() {
  return (
    <div style={{ padding: "1.5rem", flex: 1 }}>
      <p style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#718096" }}>
        <Link to="/">← Home</Link>
      </p>
      <ModuleRoute
        module={launcherModule}
        entry="pickWorkflow"
        input={{}}
        routeId="/launch"
      />
    </div>
  );
}
