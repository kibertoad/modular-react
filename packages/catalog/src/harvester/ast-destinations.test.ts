import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterAll, describe, expect, it } from "vitest";
import { extractTransitionDestinations } from "./ast-destinations.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "catalog-ast-"));
const tmpFiles: string[] = [];

function writeTmp(name: string, source: string): string {
  const path = join(tmpRoot, name);
  writeFileSync(path, source);
  tmpFiles.push(path);
  return path;
}

afterAll(() => {
  // Files are inside `mkdtempSync` so OS-level cleanup is sufficient; explicit
  // cleanup omitted intentionally (cross-platform rmdir variability).
});

describe("extractTransitionDestinations", () => {
  it("recovers next/abort/complete from concise arrows in a plain literal journey", async () => {
    const path = writeTmp(
      "plain.ts",
      `export default {
        id: "j1",
        version: "1.0.0",
        initialState: () => ({}),
        start: () => ({ module: "a", entry: "x", input: {} }),
        transitions: {
          a: {
            x: {
              allowBack: true,
              ok: () => ({ next: { module: "b", entry: "y", input: {} } }),
              cancel: () => ({ abort: { reason: "user" } }),
              done: () => ({ complete: { kind: "ok" } }),
            },
          },
        },
      };`,
    );

    const map = await extractTransitionDestinations(path, "j1");
    expect(map).toEqual({
      a: {
        x: {
          ok: { nexts: [{ module: "b", entry: "y" }], aborts: false, completes: false },
          cancel: { nexts: [], aborts: true, completes: false },
          done: { nexts: [], aborts: false, completes: true },
        },
      },
    });
  });

  it("works through a defineJourney(...)({...}) wrapper", async () => {
    const path = writeTmp(
      "wrapped.ts",
      `import { defineJourney } from "@modular-react/journeys";
       export const j = defineJourney<any, any>()({
         id: "wrapped",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           profile: {
             review: {
               next: ({ output }) => ({ next: { module: "billing", entry: "collect", input: {} } }),
             },
           },
         },
       });`,
    );

    const map = await extractTransitionDestinations(path, "wrapped");
    expect(map.profile!.review!.next).toEqual({
      nexts: [{ module: "billing", entry: "collect" }],
      aborts: false,
      completes: false,
    });
  });

  it("handles block bodies with multiple branches", async () => {
    const path = writeTmp(
      "branches.ts",
      `export default {
        id: "branchy",
        version: "1.0.0",
        initialState: () => ({}),
        start: () => ({ module: "a", entry: "x" }),
        transitions: {
          a: {
            x: {
              decide: ({ output }) => {
                if (output.kind === "fast") {
                  return { next: { module: "b", entry: "yes" } };
                }
                if (output.kind === "slow") {
                  return { next: { module: "c", entry: "later" } };
                }
                return { abort: { reason: "no-match" } };
              },
            },
          },
        },
      };`,
    );

    const map = await extractTransitionDestinations(path, "branchy");
    expect(map.a!.x!.decide).toEqual({
      nexts: [
        { module: "b", entry: "yes" },
        { module: "c", entry: "later" },
      ],
      aborts: true,
      completes: false,
    });
  });

  it("skips nested function literals when collecting returns", async () => {
    const path = writeTmp(
      "nested.ts",
      `export default {
        id: "nested",
        version: "1.0.0",
        initialState: () => ({}),
        start: () => ({ module: "a", entry: "x" }),
        transitions: {
          a: {
            x: {
              ok: () => {
                const helper = () => ({ next: { module: "wrong", entry: "wrong" } });
                return { next: { module: "right", entry: "right" } };
              },
            },
          },
        },
      };`,
    );

    const map = await extractTransitionDestinations(path, "nested");
    expect(map.a!.x!.ok!.nexts).toEqual([{ module: "right", entry: "right" }]);
  });

  it("returns empty for unresolvable handlers", async () => {
    const path = writeTmp(
      "dynamic.ts",
      `const buildNext = (mod) => ({ next: { module: mod, entry: "x" } });
       export default {
         id: "dyn",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: {
             x: {
               ok: () => buildNext("z"),
             },
           },
         },
       };`,
    );

    const map = await extractTransitionDestinations(path, "dyn");
    // The handler returns an identifier-call, not an object literal — so we
    // can't classify it and there's no entry for `ok`.
    expect(map.a?.x?.ok).toBeUndefined();
  });

  it("ignores `allowBack` (it's a config flag, not an exit)", async () => {
    const path = writeTmp(
      "allowback.ts",
      `export default {
         id: "allowback",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: { x: { allowBack: true, ok: () => ({ abort: {} }) } },
         },
       };`,
    );
    const map = await extractTransitionDestinations(path, "allowback");
    expect(Object.keys(map.a!.x!)).toEqual(["ok"]);
  });

  it("returns empty when no journey object matches the id", async () => {
    const path = writeTmp(
      "wrongid.ts",
      `export default { id: "other", version: "1", initialState: () => ({}), start: () => null, transitions: { a: { x: { ok: () => ({ abort: {} }) } } } };`,
    );
    const map = await extractTransitionDestinations(path, "expected-id");
    expect(map).toEqual({});
  });
});
