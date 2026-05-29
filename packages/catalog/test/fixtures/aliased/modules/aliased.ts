// Module descriptor that pulls a value in through the `@shared` alias. Without
// `resolve.alias` mirroring that path, this file fails to load.
import { SHARED_OWNER } from "@shared/meta";

export default {
  id: "aliased",
  version: "1.0.0",
  meta: {
    name: "Aliased",
    description: "Imports a value through a path alias.",
    ownerTeam: SHARED_OWNER,
  },
  entryPoints: { review: { component: () => null } },
  exitPoints: { done: {} },
};
