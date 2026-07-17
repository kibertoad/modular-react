// Type-level acceptance tests for `defineModule`'s navigation defaults.
//
// Production-feedback item 3 (b): `defineModule`'s nav-item generic `TNavItem`
// defaulted to `NavigationItem`, which narrows `to` to a plain `string`. A
// module that resolves its href from render-time context (`to: (ctx) => …`)
// then only compiled if the author spelled the fourth generic — so real apps
// abandoned the helper. `TNavItem` is now *inferred from the `navigation` array*
// (the parameter is typed `TDescriptor & { navigation?: readonly TNavItem[] }`),
// falling back to `NavigationItem` only when there is no navigation. That
// inference admits function-form `to` with zero generics while still accepting
// the plain-string form and any explicitly-narrowed `TNavItem`.
//
// Runs through vitest's typecheck pass (see vitest.config.ts).

import { test } from "vitest";
import { defineModule } from "./define-module.js";
import type { NavigationItem } from "./types.js";

test("function-form `to` type-checks with ZERO explicit generics", () => {
  const m = defineModule({
    id: "portal",
    version: "1.0.0",
    navigation: [
      { label: "Requests", to: (ctx: { workspaceId: string }) => `/portal/${ctx.workspaceId}` },
    ],
  });
  void m;
});

test("plain-string `to` still type-checks with ZERO explicit generics", () => {
  const m = defineModule({
    id: "settings",
    version: "1.0.0",
    navigation: [{ label: "Settings", to: "/settings" }],
  });
  void m;
});

test("an explicitly-narrowed TNavItem is still honored", () => {
  type AppNavItem = NavigationItem<"nav.billing", { orgId: string }, { badge?: "beta" }>;

  const m = defineModule<Record<string, unknown>, Record<string, never[]>, never, AppNavItem>({
    id: "billing",
    version: "1.0.0",
    navigation: [
      { label: "nav.billing", to: (ctx) => `/billing/${ctx.orgId}`, meta: { badge: "beta" } },
    ],
  });
  void m;

  const bad = defineModule<Record<string, unknown>, Record<string, never[]>, never, AppNavItem>({
    id: "billing",
    version: "1.0.0",
    // @ts-expect-error — "nope" is not the narrowed `nav.billing` label union.
    navigation: [{ label: "nope", to: "/billing" }],
  });
  void bad;
});
