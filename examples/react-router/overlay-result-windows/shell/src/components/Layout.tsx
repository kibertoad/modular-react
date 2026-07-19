import { Outlet } from "react-router";

export function Layout() {
  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        margin: 0,
        padding: 0,
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #e2e8f0",
          background: "#f7fafc",
        }}
      >
        <strong>State-keyed overlay host</strong> — React Router shell
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
