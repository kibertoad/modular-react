export * from "./integrations.js";
export * from "./app-types.js";
export { IntegrationManager } from "./IntegrationManager.js";
export type { IntegrationManagerProps } from "./IntegrationManager.js";

// Ambient module augmentation — see tsr-static-data.ts for details.
import "./tsr-static-data.js";
