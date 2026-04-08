export function storeFile(params: {
  scope: string;
  interfaceName: string;
  exportName: string;
}): string {
  return `import { createStore } from 'zustand/vanilla'
import type { ${params.interfaceName} } from '${params.scope}/app-shared'

export const ${params.exportName} = createStore<${params.interfaceName}>()(() => ({
  // TODO: Add initial state
}))
`;
}
