export * from "./integrations.js";
export * from "./app-types.js";
export { IntegrationManager } from "./IntegrationManager.js";
export type { IntegrationManagerProps } from "./IntegrationManager.js";

// Ambient type augmentation: declare that RouteObject.handle conforms to
// AppRouteData across the app. Modules get autocomplete + compile-time
// checking when they write `handle: { ... }` on a route.
import "./react-router-handle.js";
