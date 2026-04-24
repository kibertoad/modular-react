import { Link } from "react-router";
import { useNavigation } from "@modular-react/react";
import type { NavigationItem } from "@modular-react/core";

/**
 * Describes the actions the shell knows how to dispatch from a nav entry.
 * Journey launchers produce `{ kind: "journey-start", ... }` via the
 * journeys plugin; the shell stays in charge of how to run them.
 */
export type NavAction = {
  readonly kind: "journey-start";
  readonly journeyId: string;
  readonly buildInput?: (ctx?: unknown) => unknown;
};

export type ShellNavItem = NavigationItem<string, void, unknown, NavAction>;

export interface TopNavProps {
  readonly onAction: (action: NavAction) => void;
}

/**
 * Renders the app-shell nav bar from the navigation manifest. Items with a
 * plain `to` render as a Link; items carrying an `action` render as a
 * button that dispatches the action through `onAction`. This is the single
 * dispatcher site that knows how to translate `journey-start` into a
 * `runtime.start(...)` call — module / journey authors stay agnostic.
 */
export function TopNav({ onAction }: TopNavProps) {
  const nav = useNavigation<ShellNavItem>();
  const visible = nav.items.filter((item) => !item.hidden);

  if (visible.length === 0) return null;

  return (
    <nav
      aria-label="Primary"
      style={{
        display: "flex",
        gap: "0.75rem",
        padding: "0.5rem 1.5rem",
        borderBottom: "1px solid #e2e8f0",
        background: "#f7fafc",
      }}
    >
      {visible.map((item) => {
        const key = `${item.label}:${item.to ?? ""}`;
        if (item.action) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onAction(item.action as NavAction)}
              style={{
                background: "white",
                border: "1px solid #cbd5e0",
                padding: "0.25rem 0.75rem",
                borderRadius: "0.25rem",
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          );
        }
        if (typeof item.to === "string" && item.to.length > 0) {
          return (
            <Link
              key={key}
              to={item.to}
              style={{ fontSize: "0.9rem", alignSelf: "center" }}
            >
              {item.label}
            </Link>
          );
        }
        return null;
      })}
    </nav>
  );
}

