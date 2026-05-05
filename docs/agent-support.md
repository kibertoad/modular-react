# Agent support

modular-react ships agent-facing guidance for consumers who use AI coding agents alongside the human docs.

The human documentation remains canonical. Agent skills are short procedural hints that point agents at the right API path and the relevant docs before they edit code.

## TanStack Intent skills

Selected packages include [TanStack Intent](https://tanstack.com/intent) skills under `skills/<name>/SKILL.md`. They are published with the package and versioned with the APIs they describe.

Install skills in a consumer workspace:

```bash
npx @tanstack/intent@latest install
```

The installer discovers installed packages that opt into Intent with the `tanstack-intent` package keyword and adds the matching skill mappings to the agent configuration.

## Shipped skills

| Package                           | Skill               | Use it for                                                                                          |
| --------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `@react-router-modules/cli`       | `scaffolding`       | React Router workspace init, module/store/journey creation, and generated workspace wiring.         |
| `@tanstack-react-modules/cli`     | `scaffolding`       | TanStack Router workspace init, module/store/journey creation, and generated workspace wiring.      |
| `@react-router-modules/runtime`   | `framework-mode`    | `resolveManifest()`, `manifest.Providers`, slots, zones, `handle`, and dynamic slot recalculation.  |
| `@tanstack-react-modules/runtime` | `framework-mode`    | `resolveManifest()`, `manifest.Providers`, `routeTree.gen`, slots, zones, and `staticData`.         |
| `@modular-react/journeys`         | `journey-authoring` | Entry/exit contracts, `defineJourney` transitions, persistence, back behavior, and journey testing. |
| `@modular-react/catalog`          | `catalog-setup`     | `catalog.config.ts`, descriptor metadata, harvest roots, resolvers, builds, and cross-links.        |

## Relationship to docs

Skills intentionally duplicate only the smallest useful examples. For full behavior, edge cases, and API detail, use the docs referenced by each skill's `sources` frontmatter.

Use the skills to choose the right workflow. Use the docs to understand the full design.

## Generated apps

The router CLIs may scaffold an `AGENTS.md` file in generated workspaces in a later release. That file would describe local project conventions and build commands. Intent skills are different: they ship with npm packages and describe how to use modular-react APIs.

## Support status

Agent support is additive. Skills have no runtime effect, do not change package APIs, and are safe to ignore if a team does not use an Intent-compatible agent.
