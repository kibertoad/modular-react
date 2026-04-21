import type { Project } from "@example-active/app-shared";

/**
 * Hard-coded project list for the demo. In a real app this would come from
 * a separate API (`GET /api/projects`) loaded once after login — the
 * important thing is that the *list of projects* and each project's
 * *integration manifest* are fetched independently.
 */
export const projects: readonly Project[] = [
  {
    id: "project-alpha",
    name: "Project Alpha",
    description: "CRM-heavy workspace. OAuth auth, bidirectional sync, imports enabled.",
  },
  {
    id: "project-beta",
    name: "Project Beta",
    description: "Support workspace. API-key auth, read-only ticketing.",
  },
  {
    id: "project-gamma",
    name: "Project Gamma",
    description: "Analytics workspace. API-key auth, no write capabilities.",
  },
];
