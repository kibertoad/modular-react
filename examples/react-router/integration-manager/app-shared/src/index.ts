export * from "./integrations.js";
export * from "./app-types.js";
export { IntegrationManager } from "./IntegrationManager.js";
export type { IntegrationManagerProps } from "./IntegrationManager.js";

// Documentation-only side-effect import. React Router v7 does not expose a
// module-augmentation point for `RouteObject.handle`, so modules instead
// type their handle at the call site with `satisfies AppRouteData`.
// See ./react-router-handle.ts for the rationale.
import "./react-router-handle.js";
