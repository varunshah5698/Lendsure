import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import "./FinancialCredit.css";

export default function FinancialCredit() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.token) return;
    finance.creditEnvironment(session.token)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.token]);

  if (loading) return <div className="fi-credit-page"><Skeleton lines={6} /></div>;
  if (!data) return <div className="fi-credit-page"><p>Failed to load credit environment.</p></div>;

  return (
    <div className="fi-credit-page">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Credit Environment</h1>
          <p className="fi-subtitle">Credit conditions and lending environment assessment</p>
        </div>
      </div>

      <div className="fi-credit-score-card">
        <div className="fi-credit-score-label">LENDING ENVIRONMENT</div>
        <div className={`fi-credit-score-value ${data.score >= 70 ? "positive" : data.score >= 50 ? "neutral" : "negative"}`}>
          {data.score}
        </div>
        <div className={`fi-credit-score-label-text ${data.score >= 70 ? "positive" : data.score >= 50 ? "neutral" : "negative"}`}>
          {data.label}
        </div>
        <div className="fi-ai-label">LendSure Intelligence Indicator</div>
      </div>

      <div className="fi-section">
        <h2 className="fi-section-title">Environment Factors</h2>
        <div className="fi-credit-factors">
          {data.factors?.map((f, i) => (
            <div key={i} className={`fi-credit-factor fi-factor-${f.status}`}>
              <div className="fi-factor-status">
                <span className="fi-factor-dot" />
                {f.status.toUpperCase()}
              </div>
              <div className="fi-factor-name">{f.name}</div>
              <div className="fi-factor-detail">{f.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="fi-section">
        <h2 className="fi-section-title">Key Indicators</h2>
        <div className="fi-credit-indicators">
          {data.indicators?.map((ind) => (
            <div key={ind.indicator} className="fi-credit-indicator">
              <div className="fi-ci-label">{ind.indicator.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
              <div className="fi-ci-value">{ind.value}{ind.unit}</div>
              <div className="fi-ci-prev">Previous: {ind.previous}{ind.unit}</div>
              <div className="fi-ci-source">{ind.source}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
