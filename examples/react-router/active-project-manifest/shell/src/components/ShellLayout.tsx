import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar.js";

export function ShellLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "white",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "#4a5568" }}>
            Active Project Manifest Example
          </span>
        </header>
        <main style={{ flex: 1, padding: "1.5rem", backgroundColor: "#f7fafc" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
