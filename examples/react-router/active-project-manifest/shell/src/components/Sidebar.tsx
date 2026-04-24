import { Link, useLocation } from "react-router";
import { useNavigation } from "@react-router-modules/runtime";
import { ProjectPicker } from "./ProjectPicker.js";

export function Sidebar() {
  const navigation = useNavigation();
  const location = useLocation();

  const linkStyle = (href: string) => {
    const active = location.pathname === href;
    return {
      display: "block",
      padding: "0.5rem 0.75rem",
      borderRadius: "0.375rem",
      textDecoration: "none",
      color: active ? "#2b6cb0" : "#4a5568",
      backgroundColor: active ? "#ebf8ff" : "transparent",
      marginBottom: "0.25rem",
    } as const;
  };

  return (
    <aside
      style={{
        width: "260px",
        minHeight: "100vh",
        borderRight: "1px solid #e2e8f0",
        padding: "1rem",
        backgroundColor: "white",
      }}
    >
      <h1 style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "#2d3748" }}>
        Active Project Manifest
      </h1>

      <nav>
        <Link to="/" style={linkStyle("/")}>
          Home
        </Link>

        {navigation.ungrouped
          .filter((item) => !item.hidden)
          .map((item) => (
            <Link key={item.to} to={item.to} style={linkStyle(item.to)}>
              {item.label}
            </Link>
          ))}

        {navigation.groups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.hidden);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.group} style={{ marginTop: "1rem" }}>
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
                {group.group}
              </h3>
              {visibleItems.map((item) => (
                <Link key={item.to} to={item.to} style={linkStyle(item.to)}>
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      <ProjectPicker />
    </aside>
  );
}
