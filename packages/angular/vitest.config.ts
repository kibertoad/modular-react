import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    // Angular's published packages are partially compiled (partial-Ivy). Vite's
    // esbuild transform does not run the Angular Linker, so DI/JIT metadata is
    // resolved by the JIT compiler at runtime — hence the setup file imports
    // `@angular/compiler` and boots the zoneless TestBed environment.
    setupFiles: ["./vitest.setup.ts"],
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
