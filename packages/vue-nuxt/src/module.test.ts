import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @nuxt/kit so the module definition is inspectable without booting Nuxt:
// defineNuxtModule returns the raw definition (so we can call `.setup`), and
// addPluginTemplate is a spy we assert against.
const addPluginTemplate = vi.fn();
vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  addPluginTemplate,
}));

// Imported after the mock is registered (vi.mock is hoisted, so this is safe).
const { default: modularVueModule, buildModularPluginContents } = await import("./module.js");

describe("buildModularPluginContents", () => {
  it("emits a defineNuxtPlugin that installs the registry", () => {
    const src = buildModularPluginContents({ registry: "~/modular/registry" });

    expect(src).toContain('import { defineNuxtPlugin } from "#app";');
    expect(src).toContain('import { installModularApp } from "@modular-vue/nuxt/runtime";');
    expect(src).toContain('import registryExport from "~/modular/registry";');
    expect(src).toContain("export default defineNuxtPlugin((nuxtApp) => {");
    expect(src).toContain("installModularApp(nuxtApp, registry,");
    expect(src).toContain("provide: { modular: manifest }");
  });

  it("unwraps a factory registry export", () => {
    const src = buildModularPluginContents({ registry: "~/modular/registry" });
    expect(src).toContain(
      'typeof registryExport === "function" ? registryExport(nuxtApp) : registryExport',
    );
  });

  it("passes parentRouteName through as a string literal when set", () => {
    const src = buildModularPluginContents({ registry: "~/r", parentRouteName: "app" });
    expect(src).toContain('parentRouteName: "app",');
  });

  it("passes parentRouteName as undefined when omitted", () => {
    const src = buildModularPluginContents({ registry: "~/r" });
    expect(src).toContain("parentRouteName: undefined,");
  });

  it("JSON-escapes the registry path (no injection through the option)", () => {
    const src = buildModularPluginContents({ registry: 'a"; DROP TABLE' });
    // The path is embedded as a JSON string literal, so the quote is escaped
    // rather than terminating the import.
    expect(src).toContain('import registryExport from "a\\"; DROP TABLE";');
  });
});

describe("the Nuxt module definition", () => {
  beforeEach(() => {
    addPluginTemplate.mockClear();
  });

  it("declares the expected meta and defaults", () => {
    expect(modularVueModule.meta).toMatchObject({
      name: "@modular-vue/nuxt",
      configKey: "modularVue",
    });
    expect(modularVueModule.defaults).toEqual({ registry: "~/modular/registry" });
  });

  it("transpiles the package and registers the runtime plugin template", () => {
    const nuxt = { options: { build: { transpile: [] as unknown[] } } };

    modularVueModule.setup(
      { registry: "~/modular/registry", parentRouteName: "app" },
      nuxt as never,
    );

    expect(nuxt.options.build.transpile).toContain("@modular-vue/nuxt");
    expect(addPluginTemplate).toHaveBeenCalledOnce();

    const arg = addPluginTemplate.mock.calls[0][0];
    expect(arg.filename).toBe("modular-vue.plugin.mjs");

    const contents = arg.getContents();
    expect(contents).toContain('import registryExport from "~/modular/registry";');
    expect(contents).toContain('parentRouteName: "app",');
  });
});
