import { useStore } from "@example-active/app-shared";
import { projects } from "../projects.js";

/**
 * The shell-level control that drives the swap. Dumb component: it reads the
 * current `activeProjectId` + the `selectProject` action from the store and
 * wires buttons. All fetching/status-tracking lives inside `selectProject`.
 */
export function ProjectPicker() {
  const activeProjectId = useStore("integrations", (s) => s.activeProjectId);
  const status = useStore("integrations", (s) => s.status);
  const selectProject = useStore("integrations", (s) => s.selectProject);

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h3
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#a0aec0",
          marginBottom: "0.5rem",
          padding: "0 0.75rem",
        }}
      >
        Active project
      </h3>
      {projects.map((project) => {
        const isActive = project.id === activeProjectId;
        const isLoading = isActive && status === "loading";
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => {
              void selectProject(project.id);
            }}
            disabled={isLoading}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px solid transparent",
              backgroundColor: isActive ? "#ebf8ff" : "transparent",
              color: isActive ? "#2b6cb0" : "#4a5568",
              cursor: isLoading ? "wait" : "pointer",
              marginBottom: "0.25rem",
              fontSize: "0.8125rem",
            }}
          >
            <div style={{ fontWeight: 600 }}>{project.name}</div>
            <div style={{ fontSize: "0.6875rem", color: "#718096", marginTop: "0.125rem" }}>
              {project.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
