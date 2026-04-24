import { Outlet } from "react-router";
import { HeaderCommands } from "./HeaderCommands.js";
import { Sidebar } from "./Sidebar.js";

export function Layout() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid #e5e5e5",
            background: "#fafafa",
          }}
        >
          <HeaderCommands />
        </header>
        <main style={{ padding: "24px", flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
