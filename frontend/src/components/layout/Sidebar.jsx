import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Logo from "../ui/Logo";
import "./Sidebar.css";

const NAV = [
  { section: "Overview", items: [
    { label: "Dashboard", path: "/dashboard", icon: "📊" },
    { label: "Borrowers", path: "/borrowers", icon: "👥" },
  ]},
  { section: "Financial Intelligence", items: [
    { label: "Overview", path: "/financial-intelligence", icon: "🌐" },
    { label: "Live News", path: "/financial-intelligence/news", icon: "📰" },
    { label: "Markets", path: "/financial-intelligence/markets", icon: "📈" },
    { label: "Economy", path: "/financial-intelligence/economy", icon: "🏛" },
    { label: "Credit Environment", path: "/financial-intelligence/credit", icon: "💳" },
    { label: "Watchlist", path: "/financial-intelligence/watchlist", icon: "⭐" },
    { label: "Alerts", path: "/financial-intelligence/alerts", icon: "🔔" },
  ]},
  { section: "Governance", items: [
    { label: "Admin Overview", path: "/admin/overview", icon: "🛡" },
    { label: "Approvals", path: "/admin/approvals", icon: "✅" },
    { label: "Security Center", path: "/security", icon: "🔒" },
    { label: "Model Performance", path: "/admin/model", icon: "🤖" },
    { label: "Risk Policies", path: "/admin/policies", icon: "⚙" },
    { label: "Settings", path: "/admin/settings", icon: "🔧" },
  ]},
];

export default function Sidebar({ collapsed, onToggle }) {
  const { session, signOut } = useAuth();

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Logo size={32} />
          {!collapsed && <span className="sidebar-brand">LendSure</span>}
        </div>
        <button className="sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
          {collapsed ? "→" : "←"}
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((group) => (
          <div key={group.section} className="sidebar-group">
            {!collapsed && <div className="sidebar-group-label">{group.section}</div>}
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <span className="sidebar-icon">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {session && (
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(session.display_name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{session.display_name}</div>
                <div className={`sidebar-user-role ${session.role === "guest" ? "role-guest" : ""}`}>
                  {session.role}
                </div>
              </div>
            )}
          </div>
        )}
        <button className="sidebar-link sidebar-logout" onClick={signOut} title="Sign out">
          <span className="sidebar-icon">↗</span>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
