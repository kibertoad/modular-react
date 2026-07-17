import { resolve } from "pathe";
import { describe, expect, it } from "vitest";
import { buildResolve, buildSsrServerConfig } from "./ssr-server.js";

const CWD = "/project";

describe("buildSsrServerConfig", () => {
  it("disables the dependency optimizer's discovery and entry scan", () => {
    // Regression guard: both the harvester and the config loader build their
    // SSR server from this factory, and the empty `entries` list is what keeps
    // the optimizer from racing the immediate close with "server is being
    // restarted or closed" noise. Assert it for both call shapes.
    expect(buildSsrServerConfig(CWD).optimizeDeps).toEqual({ noDiscovery: true, entries: [] });
    expect(buildSsrServerConfig(CWD, { dedupe: ["react"] }).optimizeDeps).toEqual({
      noDiscovery: true,
      entries: [],
    });
  });

  it("ignores the project's own config and defaults to no plugins", () => {
    const config = buildSsrServerConfig(CWD);
    expect(config.configFile).toBe(false);
    expect(config.plugins).toEqual([]);
    expect(config.root).toBe(CWD);
  });

  it("forwards configured plugins into the SSR config (Vue SFC support)", () => {
    // A plugin is just an object with a `name`; assert the exact list is
    // threaded through so a Vue catalog config's `@vitejs/plugin-vue` reaches
    // the loader.
    const plugin = { name: "vue-stub" };
    const input = [plugin];
    const forwarded = buildSsrServerConfig(CWD, undefined, input).plugins;
    expect(forwarded).toEqual([plugin]);
    // Defensively copied, not aliased — mutating the returned list must not
    // leak back into the caller's array (mirrors the `dedupe` handling).
    expect(forwarded).not.toBe(input);
    // Plugins compose with the resolve config (harvester shape).
    expect(buildSsrServerConfig(CWD, { dedupe: ["vue"] }, [plugin]).plugins).toEqual([plugin]);
  });

  it("omits resolve when no resolve config is given (config-loader shape)", () => {
    expect(buildSsrServerConfig(CWD).resolve).toBeUndefined();
  });

  it("folds the resolve config in when provided (harvester shape)", () => {
    expect(buildSsrServerConfig(CWD, { dedupe: ["react", "react-dom"] }).resolve).toEqual({
      dedupe: ["react", "react-dom"],
    });
  });
});

describe("buildResolve", () => {
  it("returns an empty object when no resolve config is given", () => {
    expect(buildResolve(CWD)).toEqual({});
  });

  it("forwards dedupe verbatim into the resolve slice", () => {
    expect(buildResolve(CWD, { dedupe: ["react", "react-dom"] })).toEqual({
      resolve: { dedupe: ["react", "react-dom"] },
    });
  });

  it("anchors `.`-prefixed alias replacements to the config dir and passes others through", () => {
    const result = buildResolve(CWD, {
      alias: {
        "@ui": "./packages/ui/src", // relative → anchored
        react: "preact/compat", // bare specifier → unchanged
        "@abs": "/already/absolute", // absolute → unchanged
      },
    });

    expect(result).toEqual({
      resolve: {
        alias: [
          { find: "@ui", replacement: resolve(CWD, "./packages/ui/src") },
          { find: "react", replacement: "preact/compat" },
          { find: "@abs", replacement: "/already/absolute" },
        ],
      },
    });
  });

  it("preserves a RegExp find from the array form", () => {
    const result = buildResolve(CWD, {
      alias: [{ find: /^@app\//, replacement: "/abs/src/" }],
    });

    expect(result).toEqual({
      resolve: { alias: [{ find: /^@app\//, replacement: "/abs/src/" }] },
    });
  });
});
