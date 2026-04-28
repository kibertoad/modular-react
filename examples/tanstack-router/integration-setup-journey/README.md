# Integration Setup Journey — TanStack Router

Demonstrates the **state-driven module dispatch** pattern: a journey decides which module to step into next based on a value picked earlier in the flow, using `selectModuleOrDefault` from `@modular-react/journeys`.

## What this shows

1. **Slot-driven picker** — the `integration-picker` module reads `useSlots<AppSlots>().integrations` and renders one button per contributing module. Modules add themselves to the slot at registration time; the picker stays agnostic of which integrations exist.
2. **`selectModuleOrDefault` dispatch** — once the user picks a kind, the journey routes the next step:
   - `github` → dedicated `<ConfigureGithub>` (repo input + webhook output)
   - `strapi` → dedicated `<ConfigureStrapi>` (base URL + API token)
   - `contentful` / `notion` → `generic-integration`'s `<ConfigureGeneric>` via the journey's fallback
3. **Headless slot-only modules** — `contentful` and `notion` use `defineSlots(...)` to surface themselves to the picker without owning any React component. The journey funnels them through `generic-integration`.

If every integration earned a dedicated module, you'd swap `selectModuleOrDefault` for the exhaustive `selectModule` and let TypeScript fail on missing branches. See the journey definition for the inline note explaining when to pick which.

## Layout

```text
app-shared/                  IntegrationKind, AppSlots, AppDependencies
modules/
  integration-picker/        the initial step — reads the `integrations` slot
  github/                    dedicated github configure step + slot contribution
  strapi/                    dedicated strapi configure step + slot contribution
  generic-integration/       fallback configure step (reached via selectModuleOrDefault)
  contentful/                headless `defineSlots` module — slot only, no UI
  notion/                    second headless slot module
journeys/
  integration-setup/         the journey + selectModuleOrDefault dispatch
shell/                       vite app, registers everything, mounts <JourneyOutlet>
```

## Run it

```bash
pnpm install
pnpm --filter "@example-tsr-integration-setup/shell" dev
```

Open <http://localhost:5175>. Click **Start integration setup** to mount the journey, pick an integration, complete the configure step, and watch the resulting payload render below — the `kind` field tells you which dispatch branch executed.

## Run the e2e tests

```bash
pnpm --filter "@example-tsr-integration-setup/shell" test:e2e
```

Tests cover all four branches (`github`/`strapi` specific dispatch, `contentful`/`notion` fallback) plus the cancel path and slot-driven picker list.

## Key files to read

- `journeys/integration-setup/src/integration-setup.ts` — the dispatch site. The `chosen` transition handler is the whole point of the example.
- `modules/integration-picker/src/ChooseIntegration.tsx` — slot-driven list rendering.
- `modules/contentful/src/index.ts` — headless slot-only module pattern.
- `shell/e2e/branching.spec.ts` — Playwright coverage of each dispatch branch.
