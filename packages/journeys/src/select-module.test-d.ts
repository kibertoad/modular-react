// Type-level regression tests for `selectModule` / `selectModuleOrDefault`.
// Runs through `tsc --noEmit` AND vitest's typecheck pass — the assertions
// fail the test suite if exhaustiveness or per-branch input checking drift.
//
// The point: prove the helpers reject mistyped cases, missing cases, and
// wrong-shaped fallbacks at compile time. Covered via `@ts-expect-error`
// directives plus `expectTypeOf` on the return shape.

import { expectTypeOf, test } from "vitest";
import {
  buildInputFor,
  defineEntry,
  defineExit,
  defineModule,
  schema,
  type StepSpec,
} from "@modular-react/core";
import { selectModule, selectModuleOrDefault } from "./select-module.js";

// -----------------------------------------------------------------------------
// Module fixtures with deliberately divergent input shapes per module — that
// way swapping inputs between cases is a real type error, not just an
// indistinguishable structural duplicate.
// -----------------------------------------------------------------------------

const github = defineModule({
  id: "github",
  version: "1.0.0",
  exitPoints: { saved: defineExit<{ ref: string }>() } as const,
  entryPoints: {
    configure: defineEntry({
      component: (() => null) as never,
      input: schema<{ workspaceId: string; repo: string }>(),
    }),
  },
});

const strapi = defineModule({
  id: "strapi",
  version: "1.0.0",
  exitPoints: { saved: defineExit<{ ref: string }>() } as const,
  entryPoints: {
    configure: defineEntry({
      component: (() => null) as never,
      input: schema<{ workspaceId: string; url: string }>(),
    }),
  },
});

const generic = defineModule({
  id: "generic",
  version: "1.0.0",
  exitPoints: { saved: defineExit<{ ref: string }>() } as const,
  entryPoints: {
    configure: defineEntry({
      component: (() => null) as never,
      input: schema<{ workspaceId: string; kind: string }>(),
    }),
  },
});

type Modules = {
  readonly github: typeof github;
  readonly strapi: typeof strapi;
  readonly generic: typeof generic;
};

const select = selectModule<Modules>();
const selectOrDefault = selectModuleOrDefault<Modules>();

// -----------------------------------------------------------------------------
// Baselines that must compile
// -----------------------------------------------------------------------------

// `declare` avoids the literal-narrowing TS applies to a `const` initialised
// with a literal value — without it, every read of `goodKey` would narrow
// `TKey` to "github" alone and the cases object would fail excess-property
// checks on `strapi`.
declare const goodKey: "github" | "strapi";

select(goodKey, {
  github: { entry: "configure", input: { workspaceId: "w", repo: "r" } },
  strapi: { entry: "configure", input: { workspaceId: "w", url: "u" } },
});

selectOrDefault(
  goodKey,
  { github: { entry: "configure", input: { workspaceId: "w", repo: "r" } } },
  { module: "generic", entry: "configure", input: { workspaceId: "w", kind: "k" } },
);

// -----------------------------------------------------------------------------
// Exhaustive form — failures TS must catch
// -----------------------------------------------------------------------------

// Missing branch: `strapi` is part of the discriminator union but absent
// from the cases object. The error fires on the cases-object argument
// itself, so the directive sits on the call line.
// @ts-expect-error — exhaustiveness violation: missing `strapi` case.
select(goodKey, {
  github: { entry: "configure", input: { workspaceId: "w", repo: "r" } },
});

// Wrong input shape under `github` — `url` is strapi's input, not github's.
select(goodKey, {
  // @ts-expect-error — `repo` required, `url` not allowed on github.configure.
  github: { entry: "configure", input: { workspaceId: "w", url: "u" } },
  strapi: { entry: "configure", input: { workspaceId: "w", url: "u" } },
});

// Wrong entry name — github only declares `configure`.
select(goodKey, {
  // @ts-expect-error — entry "wrong" is not declared on github.entryPoints.
  github: { entry: "wrong", input: { workspaceId: "w", repo: "r" } },
  strapi: { entry: "configure", input: { workspaceId: "w", url: "u" } },
});

// Module id outside the journey's module map.
// @ts-expect-error — "ghost" is not a key of `Modules`.
select("ghost", {
  ghost: { entry: "configure", input: { workspaceId: "w" } },
});

// -----------------------------------------------------------------------------
// Fallback form — failures TS must catch
// -----------------------------------------------------------------------------

// Fallback's `module` must still be a known module id.
selectOrDefault(
  goodKey,
  { github: { entry: "configure", input: { workspaceId: "w", repo: "r" } } },
  // @ts-expect-error — "ghost" is not a key of `Modules`.
  { module: "ghost", entry: "configure", input: {} },
);

// Fallback's `input` must match its `module`+`entry`.
selectOrDefault(
  goodKey,
  { github: { entry: "configure", input: { workspaceId: "w", repo: "r" } } },
  // @ts-expect-error — `repo` is github-shaped, not generic.configure-shaped.
  { module: "generic", entry: "configure", input: { workspaceId: "w", repo: "r" } },
);

// Cases keys must still be known module ids — typo on a partial case.
selectOrDefault(
  goodKey,
  // @ts-expect-error — "githuub" (typo) is not a key of `Modules`.
  { githuub: { entry: "configure", input: { workspaceId: "w", repo: "r" } } },
  { module: "generic", entry: "configure", input: { workspaceId: "w", kind: "k" } },
);

// Discriminator wider than the module map is OK in the fallback form
// (that's the whole point).
declare const wideKey: "github" | "strapi" | "contentful";
selectOrDefault(
  wideKey,
  { github: { entry: "configure", input: { workspaceId: "w", repo: "r" } } },
  { module: "generic", entry: "configure", input: { workspaceId: "w", kind: "k" } },
);

// -----------------------------------------------------------------------------
// expectTypeOf assertions
// -----------------------------------------------------------------------------

test("selectModule returns a StepSpec narrowed to the journey's module map", () => {
  // Take `kind` as a parameter so TS can't narrow it via control-flow
  // analysis the way it would with a `const` initialised to a literal —
  // narrowing TKey to a single key turns the sibling case into an
  // excess-property error and masks the return-type assertion we want
  // to make here.
  function dispatch(kind: "github" | "strapi") {
    return select(kind, {
      github: { entry: "configure", input: { workspaceId: "w", repo: "r" } },
      strapi: { entry: "configure", input: { workspaceId: "w", url: "u" } },
    });
  }
  expectTypeOf(dispatch).returns.toEqualTypeOf<StepSpec<Modules>>();
});

test("selectModuleOrDefault returns a StepSpec narrowed to the journey's module map", () => {
  const result = selectOrDefault(
    wideKey,
    { github: { entry: "configure", input: { workspaceId: "w", repo: "r" } } },
    { module: "generic", entry: "configure", input: { workspaceId: "w", kind: "k" } },
  );
  expectTypeOf(result).toEqualTypeOf<StepSpec<Modules>>();
});

// -----------------------------------------------------------------------------
// buildInput entries — a `selectModule` case may omit `input`, since the
// runtime re-derives it from journey state.
// -----------------------------------------------------------------------------

const wizard = defineModule({
  id: "wizard",
  version: "1.0.0",
  exitPoints: { saved: defineExit<{ ref: string }>() } as const,
  entryPoints: {
    step: defineEntry({
      component: (() => null) as never,
      input: schema<{ readonly seeded: string }>(),
      buildInput: buildInputFor<{ readonly seed: string }>()((state) => ({
        seeded: state.seed,
      })),
    }),
  },
});

type WizardModules = { readonly github: typeof github; readonly wizard: typeof wizard };
const selectWizard = selectModule<WizardModules>();
declare const wizardKey: "github" | "wizard";

test("selectModule case may omit `input` for a buildInput entry", () => {
  selectWizard(wizardKey, {
    github: { entry: "configure", input: { workspaceId: "w", repo: "r" } },
    wizard: { entry: "step" },
  });
});

test("selectModule case still requires `input` for a non-buildInput entry", () => {
  selectWizard(wizardKey, {
    // @ts-expect-error — github.configure has no buildInput; `input` is required.
    github: { entry: "configure" },
    wizard: { entry: "step" },
  });
});

test("selectModule case still shape-checks a stamped `input` for a buildInput entry", () => {
  selectWizard(wizardKey, {
    github: { entry: "configure", input: { workspaceId: "w", repo: "r" } },
    // @ts-expect-error — `wrong` is not wizard.step's input shape `{ seeded: string }`.
    wizard: { entry: "step", input: { wrong: 1 } },
  });
});
