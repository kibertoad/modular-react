# @modular-vue/cli

Scaffolding CLI for modular-react's **Vue 3 + vue-router** family. Creates
projects, modules, stores, journeys, and a catalog with full wiring — the Vue
counterpart of [`@react-router-modules/cli`](https://github.com/kibertoad/modular-react/tree/main/packages/react-router-cli).

## Commands

```bash
# Bootstrap a new pnpm workspace with shell + first module.
# Add --with-catalog to also scaffold a catalog.config.ts.
modular-vue init <name> --scope @myorg --module dashboard [--with-catalog]

# Add a routed module (SFC pages + a route-zone detail panel) and wire it
# into the shell + package.json.
modular-vue create module <name> [--route ROUTE] [--nav-group GROUP]

# Add a framework core store (createStore from @modular-vue/vue), declare it
# in AppDependencies, and inject it into the registry.
modular-vue create store <name>

# Scaffold a typed multi-module workflow (see @modular-vue/journeys).
modular-vue create journey <name> [--modules a,b,c] [--persistence]

# Wire @modular-react/catalog into an existing workspace.
modular-vue create catalog
```

The generated app is idiomatic Vue: `<script setup>` SFCs, a shell that owns
the vue-router router and grafts module routes under a named `root` layout
route (`createModularApp`), route zones and typed route data on `meta`, and the
framework core `createStore` (decision D3) for shared state. Every generated
package ships a `vue-tsc --noEmit` typecheck script; module tests run through
`@modular-vue/testing`'s `renderModule` with `@vitejs/plugin-vue` registered in
a root `vitest.config.ts`.

`create journey` produces a `journeys/<name>/` package with a journey
definition, a typed handle, and (with `--persistence`) a localStorage adapter
under `shell/src/`. It installs `journeysPlugin()` on the shell's registry and
registers the journey, leaving only the per-step transitions and module
entry/exit contracts for you to fill in (see
[`@modular-vue/journeys`](https://github.com/kibertoad/modular-react/blob/main/packages/vue-journeys/README.md)).

All commands support interactive (prompts) and non-interactive (flags) modes.
Run any command with `--help` for its full flag set.

## Development

Requires Node.js 22+.

```bash
pnpm build          # Compile TypeScript
pnpm dev            # Watch mode
pnpm test           # cli-testlab unit tests + generated-tree snapshot
```

The implementation lives in
[`@modular-react/cli-core`](https://github.com/kibertoad/modular-react/tree/main/packages/cli-core);
this package only supplies the Vue-specific preset — SFC template fragments, the
`vue` / `vue-router` / `vue-tsc` `package.json` bodies, and binary metadata. The
React CLIs reuse the same core with their own presets.
