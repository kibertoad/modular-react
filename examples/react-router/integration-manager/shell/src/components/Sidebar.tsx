import { NavLink } from "react-router";
import { useNavigation } from "@modular-react/react";

export function Sidebar() {
  const manifest = useNavigation();

  return (
    <nav style={{ borderRight: "1px solid #e5e5e5", padding: "16px" }}>
      <NavLink to="/" style={{ fontWeight: 600, display: "block", marginBottom: "16px" }}>
        Home
      </NavLink>
      {manifest.groups.map((group) => (
        <section key={group.group} style={{ marginBottom: "16px" }}>
          <h3
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              color: "#888",
              margin: "0 0 6px",
            }}
          >
            {group.group}
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {group.items.map((item) => (
              // This example uses the default NavigationItem context (`void`),
              // so `item.to` is always a string. If you adopt function-form
              // hrefs (NavigationItem<TLabel, TContext> with TContext !== void),
              // resolve `item.to(context)` here instead of falling back to "#".
              <li key={`${group.group}:${item.label}:${String(item.to)}`}>
                <NavLink to={typeof item.to === "string" ? item.to : "#"}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
