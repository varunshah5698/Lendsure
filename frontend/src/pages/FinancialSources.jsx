import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import "./FinancialEconomy.css";

export default function FinancialSources() {
  const { session } = useAuth();
  const [sources, setSources] = useState(null);

  useEffect(() => {
    if (!session?.token) return;
    finance.sources(session.token).then(setSources).catch(() => {});
  }, [session?.token]);

  if (!sources) return <div className="fi-economy-page"><Skeleton lines={4} /></div>;

  return (
    <div className="fi-economy-page">
      <Link to="/financial-intelligence" className="fi-back">← Back to Overview</Link>
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Data Sources</h1>
          <p className="fi-subtitle">Where every number comes from — no hidden feeds</p>
        </div>
      </div>
      <div className="fi-econ-table">
        <div className="fi-econ-row fi-econ-header">
          <span>Source</span><span>Provider</span><span>Coverage</span><span>Status</span><span>Last updated</span>
        </div>
        {Object.entries(sources).map(([key, s]) => (
          <div key={key} className="fi-econ-row">
            <span className="fi-econ-name">{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
            <span>{s.provider}</span>
            <span className="fi-econ-prev">{s.coverage}</span>
            <span className="fi-econ-value" style={{ color: s.status === "active" ? "var(--success)" : "var(--danger)" }}>
              ● {s.status}
            </span>
            <span className="fi-econ-source">{s.last_updated ? new Date(s.last_updated).toLocaleString() : "—"}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14 }}>
        Market, news and economic feeds are currently simulated seed data served by the LendSure backend
        (React → LendSure Backend → cache → React). Connect real provider API keys server-side to go live —
        keys must never ship in the browser bundle.
      </p>
    </div>
  );
}
