import type { StoreFileParams } from "@modular-react/cli-core";

export function storeFile(params: StoreFileParams): string {
  return `import { createStore } from '@modular-vue/vue'
import type { ${params.interfaceName} } from '${params.scope}/app-shared'

// The framework core store (decision D3) — a zustand-shaped vanilla store.
// Update it with \`${params.exportName}.setState(...)\` (partial-merged); read it
// reactively in modules via the typed \`useStore\` composable from app-shared.
export const ${params.exportName} = createStore<${params.interfaceName}>({
  // TODO: Add initial state
})
`;
}
