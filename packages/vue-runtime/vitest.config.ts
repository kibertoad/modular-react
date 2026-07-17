import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Component/integration tests mount real Vue trees (route-builder, the
    // provider plugin, the app-shell integration), so they need a DOM.
    environment: "happy-dom",
    // Pick up type-level assertions (`expectTypeOf(...)`, `assertType(...)`)
    // from `*.test-d.ts` files. Runtime behavior tests live in `*.test.ts`.
    // Both are run by `pnpm test`.
    typecheck: {
      enabled: true,
      include: ["src/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
});
