import type { StoreFileParams } from "@modular-react/cli-core";

export function storeFile(params: StoreFileParams): string {
  return `import { createStore } from 'zustand/vanilla'
import type { ${params.interfaceName} } from '${params.scope}/app-shared'

export const ${params.exportName} = createStore<${params.interfaceName}>()(() => ({
  // TODO: Add initial state
}))
`;
}
