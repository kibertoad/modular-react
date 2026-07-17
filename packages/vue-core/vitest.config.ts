import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
