import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import TimeAgo from "../components/ui/TimeAgo";
import "./FinancialAlerts.css";

export default function FinancialAlerts() {
  const { session } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!session?.token) return;
    setLoading(true);
    finance.alerts({}, session.token)
      .then(setAlerts)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [session?.token]);

  const markRead = (id) => {
    finance.markAlertRead(id, session.token).then(load);
  };

  if (loading) return <div className="fi-alerts-page"><Skeleton lines={5} /></div>;

  return (
    <div className="fi-alerts-page">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Risk Alerts</h1>
          <p className="fi-subtitle">Market, economic, and lending environment alerts</p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="fi-empty-state">
          <div className="fi-empty-icon">🔔</div>
          <h3>No alerts</h3>
          <p>Alerts will appear when significant market or economic events occur.</p>
        </div>
      ) : (
        <div className="fi-alerts-list">
          {alerts.map((a) => (
            <div key={a.id} className={`fi-alert-item ${a.is_read ? "" : "fi-alert-unread"}`}
              onClick={() => !a.is_read && markRead(a.id)}>
              <div className="fi-alert-severity">
                <span className={`fi-severity-dot fi-severity-${a.severity}`} />
              </div>
              <div className="fi-alert-content">
                <div className="fi-alert-title">{a.title}</div>
                {a.description && <div className="fi-alert-desc">{a.description}</div>}
                <div className="fi-alert-meta">
                  <span>{a.category}</span>
                  <span>{a.source}</span>
                  <span><TimeAgo ts={a.created_at} /></span>
                </div>
              </div>
              {!a.is_read && <div className="fi-alert-unread-dot" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
