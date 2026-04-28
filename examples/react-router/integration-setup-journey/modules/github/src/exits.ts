import { defineExit } from "@modular-react/core";

export const githubExits = {
  saved: defineExit<{ repo: string; webhookId: string }>(),
  cancelled: defineExit(),
} as const;

export type GithubExits = typeof githubExits;
