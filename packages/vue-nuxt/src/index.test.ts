import { describe, it, expect, vi } from "vitest";

// module.js imports @nuxt/kit at load time; stub it so the barrel resolves in a
// plain node/happy-dom test env without pulling Nuxt's builder.
vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  addPluginTemplate: vi.fn(),
}));

const barrel = await import("./index.js");

describe("@modular-vue/nuxt barrel", () => {
  it("exports the runtime installer and the plugin-source builder", () => {
    expect(barrel.installModularApp).toBeTypeOf("function");
    expect(barrel.buildModularPluginContents).toBeTypeOf("function");
  });

  it("default-exports the Nuxt module definition", () => {
    expect(barrel.default).toBeDefined();
    expect((barrel.default as { meta: { name: string } }).meta.name).toBe("@modular-vue/nuxt");
  });
});
