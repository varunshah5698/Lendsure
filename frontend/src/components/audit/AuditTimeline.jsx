import "./AuditTimeline.css";

const ACTION_LABELS = {
  analysis_completed: "Analysis Completed",
  simulation: "Simulation Run",
  document_uploaded: "Document Uploaded",
  document_reviewed: "Document Reviewed",
  config_changed: "Policy Updated",
  review_decision: "Decision Reviewed",
  session_revoked: "Session Revoked",
};

const ACTION_ICONS = {
  analysis_completed: "📊",
  simulation: "🧪",
  document_uploaded: "📄",
  document_reviewed: "👁",
  config_changed: "⚙",
  review_decision: "✅",
  session_revoked: "🔒",
};

export default function AuditTimeline({ events = [] }) {
  if (!events.length) {
    return <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "20px 0" }}>No audit events recorded.</div>;
  }

  return (
    <div className="audit-timeline">
      {events.map((e) => (
        <div key={e.id} className="audit-event">
          <div className="audit-dot" />
          <div className="audit-content">
            <div className="audit-header">
              <span className="audit-action-icon">{ACTION_ICONS[e.action] || "●"}</span>
              <span className="audit-action">{ACTION_LABELS[e.action] || e.action.replace(/_/g, " ")}</span>
            </div>
            <div className="audit-meta">
              <span className="audit-time">{new Date(e.created_at + "Z").toLocaleString()}</span>
              <span className="audit-sep">·</span>
              <span className="audit-actor">{e.actor}</span>
            </div>
            {e.detail && (
              <div className="audit-detail">
                {(() => {
                  try {
                    const obj = JSON.parse(e.detail);
                    return Object.entries(obj).map(([k, v]) => (
                      <span key={k} className="audit-detail-item">
                        <span className="audit-detail-key">{k.replace(/_/g, " ")}:</span>{" "}
                        <span className="audit-detail-value">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                      </span>
                    ));
                  } catch {
                    return <span>{e.detail.slice(0, 200)}</span>;
                  }
                })()}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
