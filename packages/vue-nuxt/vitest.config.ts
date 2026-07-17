import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The installer test mounts a real Vue tree on a real vue-router (memory
    // history) to assert routes are grafted and contexts injected, so it needs
    // a DOM.
    environment: "happy-dom",
    // Pick up type-level assertions (`expectTypeOf(...)`, `assertType(...)`)
    // from `*.test-d.ts` files. Runtime behavior tests live in `*.test.ts`.
    typecheck: {
      enabled: true,
      include: ["src/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
});
