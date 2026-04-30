import { describe, expect, it } from "vitest";
import { applyResolver } from "./resolve.js";

const aModule = { id: "a", version: "1.0.0", slots: { commands: [] } };
const bModule = { id: "b", version: "1.0.0", slots: { commands: [] } };

describe("applyResolver", () => {
  describe("defaultExport", () => {
    it("picks the default export", () => {
      expect(applyResolver("defaultExport", { default: aModule }, "x.ts")).toEqual([aModule]);
    });

    it("returns empty when no default export is present", () => {
      expect(applyResolver("defaultExport", { other: aModule }, "x.ts")).toEqual([]);
    });

    it("is the implicit default when resolver is undefined", () => {
      expect(applyResolver(undefined, { default: aModule }, "x.ts")).toEqual([aModule]);
    });
  });

  describe("namedExport", () => {
    it("picks every non-default descriptor-shaped export", () => {
      const result = applyResolver(
        "namedExport",
        { default: undefined, billing: aModule, helpers: { unrelated: true } },
        "x.ts",
      );
      expect(result).toEqual([aModule]);
    });

    it("targets a specific export when configured", () => {
      const result = applyResolver(
        { kind: "namedExport", exportName: "myModule" },
        { myModule: aModule, anotherThing: bModule },
        "x.ts",
      );
      expect(result).toEqual([aModule]);
    });
  });

  describe("objectMap", () => {
    it("returns values of the default export when it's an object", () => {
      expect(applyResolver("objectMap", { default: { x: aModule, y: bModule } }, "f.ts")).toEqual([
        aModule,
        bModule,
      ]);
    });

    it("falls back to non-default exports when default is missing", () => {
      expect(applyResolver("objectMap", { x: aModule, y: bModule }, "f.ts")).toEqual([
        aModule,
        bModule,
      ]);
    });
  });

  describe("custom", () => {
    it("delegates to the user-provided selector", () => {
      const result = applyResolver(
        {
          kind: "custom",
          select: (mod) => Object.values(mod).filter((v) => Array.isArray(v) === false),
        },
        { default: aModule, helpers: bModule },
        "f.ts",
      );
      expect(result).toEqual([aModule, bModule]);
    });
  });
});
