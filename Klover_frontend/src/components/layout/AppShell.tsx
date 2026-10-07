import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Icon, Wordmark } from "../ui";
import type { IconName } from "../ui";
import "./AppShell.css";

// Pages routed in this test build (see App.tsx for what is left out).
const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Watering control", icon: "droplet", end: true },
  { to: "/schedules", label: "Schedules", icon: "calendar" },
  { to: "/weather", label: "Weather", icon: "cloud" },
  { to: "/data", label: "Sensor data", icon: "database" },
];

export function AppShell() {
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const bleed = false;

  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? " is-open" : ""}`}>
        <div className="sidebar__brand">
          <Wordmark tone="light" size={22} />
        </div>

        <nav className="sidebar__nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar__link${isActive ? " is-active" : ""}`}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__spacer" />

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="sidebar__avatar">K</span>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar__user-name">Signed in</div>
              <div className="sidebar__user-email">Test account</div>
            </div>
            <button
              type="button"
              className="sidebar__signout"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void signOut()}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      {menuOpen ? (
        <div className="shell__scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      ) : null}

      <main className={`main${bleed ? " main--bleed" : ""}`}>
        <div className={`main__inner${bleed ? " main__inner--bleed" : ""}`}>
          <button
            type="button"
            className="shell__menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="overview" size={16} />
            Menu
          </button>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** Shared page heading. */
export function PageHead({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Optional tinted tile that gives the screen a subject at a glance. */
  icon?: IconName;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      {icon ? (
        <span className="page-head__icon" aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
      ) : null}
      <div className="page-head__text">
        <h1 className="page-head__title">{title}</h1>
        {subtitle ? <p className="page-head__subtitle">{subtitle}</p> : null}
      </div>
      <div className="page-head__actions">
        {actions}
      </div>
    </header>
  );
}
