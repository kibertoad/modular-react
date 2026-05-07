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
          ok: {
            nexts: [{ module: "b", entry: "y" }],
            aborts: false,
            completes: false,
          },
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

  it("unwraps a `defineTransition({ targets, handle })`-wrapped handler", async () => {
    // The runtime supports a wrapped form that attaches `targets` metadata
    // for the auto-preloader. The harvester must descend into the inner
    // `handle:` function to recover the destination — the wrapper is
    // otherwise transparent.
    const path = writeTmp(
      "wrapped-define-transition.ts",
      `export default {
         id: "wrapped",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: {
             x: {
               ok: defineTransition({
                 targets: [{ module: "b", entry: "y" }],
                 handle: () => ({ next: { module: "b", entry: "y", input: {} } }),
               }),
               cancel: defineTransition({
                 // Terminal-only handler MUST declare the sentinel — the
                 // harvester no longer walks the handler body when targets
                 // is present (declaration is the source of truth).
                 targets: ["abort"],
                 handle: () => ({ abort: { reason: "user" } }),
               }),
             },
           },
         },
       };`,
    );

    const map = await extractTransitionDestinations(path, "wrapped");
    expect(map.a?.x?.ok).toEqual({
      nexts: [{ module: "b", entry: "y" }],
      aborts: false,
      completes: false,
      // `targets:` was present, so `nexts` is authoritative (declared).
      targetsDeclared: true,
    });
    expect(map.a?.x?.cancel).toEqual({
      nexts: [],
      // `aborts: true` comes from the declared `"abort"` sentinel —
      // not from walking the handler body.
      aborts: true,
      completes: false,
      targetsDeclared: true,
    });
  });

  it("unwraps a curried-binder call (`const t = defineTransition<...>(); t({...})`)", async () => {
    // Same as above but the binder is a local variable — the harvester
    // doesn't care about the callee identifier, only the spec object shape.
    const path = writeTmp(
      "curried.ts",
      `const transition = defineTransition();
       export default {
         id: "curried",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: {
             x: {
               ok: transition({
                 targets: [{ module: "b", entry: "y" }],
                 handle: () => ({ next: { module: "b", entry: "y", input: {} } }),
               }),
             },
           },
         },
       };`,
    );

    const map = await extractTransitionDestinations(path, "curried");
    expect(map.a?.x?.ok).toEqual({
      nexts: [{ module: "b", entry: "y" }],
      aborts: false,
      completes: false,
      targetsDeclared: true,
    });
  });

  it("prefers declared `targets` over AST inference (catches dynamic-return branches)", async () => {
    // The inner handler returns `next` from a ternary the AST can't reduce
    // — without `targets:` we would extract zero destinations. With
    // declared targets the catalog gets the FULL static destination set.
    const path = writeTmp(
      "dynamic-with-targets.ts",
      `export default {
         id: "dyn-decl",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: {
             x: {
               branch: defineTransition({
                 targets: [{ module: "b", entry: "y" }, { module: "c", entry: "z" }],
                 handle: ({ output }) => ({
                   next:
                     output.kind === "y"
                       ? { module: "b", entry: "y", input: {} }
                       : { module: "c", entry: "z", input: {} },
                 }),
               }),
             },
           },
         },
       };`,
    );

    const map = await extractTransitionDestinations(path, "dyn-decl");
    expect(map.a?.x?.branch).toEqual({
      nexts: [
        { module: "b", entry: "y" },
        { module: "c", entry: "z" },
      ],
      aborts: false,
      completes: false,
      targetsDeclared: true,
    });
  });

  it("treats a CallExpression without `targets:` as opaque", async () => {
    // `targets` is mandatory on every `defineTransition` call, so its
    // absence here means this is some unrelated helper (or a malformed
    // call) the harvester has no contract with. Don't recurse into the
    // inner `handle:` function — that would falsely surface destinations
    // for a wrapper that may not even forward the handler verbatim.
    const path = writeTmp(
      "no-targets.ts",
      `export default {
         id: "no-decl",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: {
             x: {
               ok: someOtherWrapper({
                 handle: () => ({ next: { module: "b", entry: "y", input: {} } }),
               }),
             },
           },
         },
       };`,
    );
    const map = await extractTransitionDestinations(path, "no-decl");
    expect(map.a?.x?.ok).toBeUndefined();
  });

  it("derives `aborts` / `completes` flags from terminal sentinels in `targets`", async () => {
    // With `defineTransition` the targets array is the source of truth for
    // ALL outcomes — both next refs and the terminal arms. The harvester
    // should set `aborts` / `completes` from the sentinels rather than
    // walking the handler body.
    const path = writeTmp(
      "sentinels.ts",
      `export default {
         id: "sentinels",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: {
             x: {
               cancel: defineTransition({
                 targets: ["abort"],
                 handle: () => ({ abort: { reason: "user" } }),
               }),
               finish: defineTransition({
                 targets: ["complete"],
                 handle: () => ({ complete: { ok: true } }),
               }),
               proceed: defineTransition({
                 targets: [{ module: "b", entry: "y" }, "abort"],
                 handle: ({ output }) =>
                   output.ok
                     ? { next: { module: "b", entry: "y", input: {} } }
                     : { abort: { reason: "rejected" } },
               }),
             },
           },
         },
       };`,
    );

    const map = await extractTransitionDestinations(path, "sentinels");
    expect(map.a?.x?.cancel).toEqual({
      nexts: [],
      aborts: true,
      completes: false,
      targetsDeclared: true,
    });
    expect(map.a?.x?.finish).toEqual({
      nexts: [],
      aborts: false,
      completes: true,
      targetsDeclared: true,
    });
    expect(map.a?.x?.proceed).toEqual({
      nexts: [{ module: "b", entry: "y" }],
      aborts: true,
      completes: false,
      targetsDeclared: true,
    });
  });

  it('accepts `"invoke"` sentinel without crashing (no schema slot today)', async () => {
    // The catalog schema doesn't have an `invokes` flag yet; the parser
    // accepts the sentinel so handlers that may invoke aren't rejected.
    const path = writeTmp(
      "invoke-sentinel.ts",
      `export default {
         id: "invoke-sent",
         version: "1.0.0",
         initialState: () => ({}),
         start: () => ({ module: "a", entry: "x" }),
         transitions: {
           a: { x: { fanout: defineTransition({ targets: ["invoke"], handle: () => ({ invoke: {} }) }) } },
         },
       };`,
    );
    const map = await extractTransitionDestinations(path, "invoke-sent");
    expect(map.a?.x?.fanout).toEqual({
      nexts: [],
      aborts: false,
      completes: false,
      targetsDeclared: true,
    });
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
