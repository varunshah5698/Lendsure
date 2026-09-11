import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import TimeAgo from "../components/ui/TimeAgo";
import TrendArrow from "../components/ui/TrendArrow";
import TickerTape from "../components/finance/TickerTape";
import "./FinancialOverview.css";

const IMPACT_COLORS = { high: "var(--danger)", medium: "var(--warning)", low: "var(--success)" };

export default function FinancialOverview() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [brLoading, setBrLoading] = useState(false);

  const refreshBriefing = () => {
    if (!session?.token) return;
    setBrLoading(true);
    finance.briefing(session.token)
      .then(setBriefing)
      .catch(() => {})
      .finally(() => setBrLoading(false));
  };

  useEffect(() => {
    if (!session?.token) return;
    Promise.all([
      finance.overview(session.token),
      finance.briefing(session.token),
      finance.portfolioImpact(session.token).catch(() => null),
    ]).then(([ov, br, im]) => { setData(ov); setBriefing(br); setImpact(im); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.token]);

  // live refresh of market numbers every 30s while visible (silent)
  useEffect(() => {
    if (!session?.token) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      finance.overview(session.token).then(setData).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [session?.token]);

  if (loading) return <div className="fi-overview"><Skeleton lines={6} /></div>;
  if (!data) return <div className="fi-overview"><p>Failed to load financial intelligence.</p></div>;

  const newest = (data.market_status || []).reduce(
    (m, a) => (!m || (a.updated_at || "") > m ? (a.updated_at || "") : m), "");
  const ageS = newest ? Math.max(0, Math.round((Date.now() - new Date(newest.length === 16 ? newest + ":00" : newest).getTime()) / 1000)) : null;
  const live = ageS != null && ageS < 180;
  const ageLabel = ageS == null ? "unknown age" : ageS < 60 ? `${ageS}s ago` : ageS < 3600 ? `${Math.floor(ageS / 60)}m ago` : `${Math.floor(ageS / 3600)}h ago`;

  return (
    <div className="fi-overview">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Financial Intelligence</h1>
          <p className="fi-subtitle">Market & economic conditions affecting lending</p>
        </div>
        <div className="fi-demo-badge" title={live ? "Prices refreshed from Yahoo Finance within the last 3 minutes" : "Provider slow or rate-limited — showing last stored quotes"}>
          <span className="fi-demo-dot" style={{ background: live ? "#22c55e" : "#f59e0b", boxShadow: live ? "0 0 6px #22c55e" : "none" }} />
          {live ? `LIVE · ${ageLabel}` : `STALE · ${ageLabel}`}
        </div>
      </div>

      {/* Top summary cards */}
      <TickerTape items={data.market_status} />
      <div className="fi-summary-grid">
        <Link to="/financial-intelligence/markets" className="fi-summary-card">
          <div className="fi-summary-label">MARKETS</div>
          <div className="fi-summary-value">{data.market_status?.[0]?.name || "—"}</div>
          <div className={`fi-summary-change ${(data.market_status?.[0]?.change_pct || 0) >= 0 ? "positive" : "negative"}`}>
            {data.market_status?.[0]?.change_pct >= 0 ? "+" : ""}{data.market_status?.[0]?.change_pct?.toFixed(2)}%
          </div>
        </Link>
        <Link to="/financial-intelligence/economy" className="fi-summary-card">
          <div className="fi-summary-label">ECONOMY</div>
          <div className="fi-summary-value">GDP {data.economy?.gdp_growth?.value}%</div>
          <div className="fi-summary-detail">CPI {data.economy?.inflation?.value}%</div>
        </Link>
        <Link to="/financial-intelligence/credit" className="fi-summary-card">
          <div className="fi-summary-label">CREDIT</div>
          <div className="fi-summary-value">{data.economy?.credit_growth?.value}% growth</div>
          <div className="fi-summary-detail">Repo {data.economy?.repo_rate?.value}%</div>
        </Link>
        <div className="fi-summary-card">
          <div className="fi-summary-label">LENDING ENVIRONMENT</div>
          <div className={`fi-env-score ${(data.lending_environment?.score || 0) >= 70 ? "positive" : (data.lending_environment?.score || 0) >= 50 ? "neutral" : "negative"}`}>
            {data.lending_environment?.score}
          </div>
          <div className="fi-summary-detail">{data.lending_environment?.label}</div>
        </div>
      </div>

      {/* Market tickers */}
      <div className="fi-section">
        <h2 className="fi-section-title">Market Snapshot</h2>
        <div className="fi-ticker-grid">
          {data.market_status?.map((a) => (
            <div key={a.symbol} className="fi-ticker-item">
              <div className="fi-ticker-name">{a.name}</div>
              <div className="fi-ticker-price">{typeof a.price === "number" ? a.price.toLocaleString() : "—"}</div>
              <div className={`fi-ticker-change ${a.change_pct >= 0 ? "positive" : "negative"}`}>
                <TrendArrow value={a.change_pct} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Briefing */}
      {briefing && (
        <div className="fi-section">
          <div className="fi-section-header">
            <h2 className="fi-section-title">AI Intelligence Briefing</h2>
            <span>
              <button className="kit-page-btn" onClick={refreshBriefing} disabled={brLoading}>
                {brLoading ? "Generating…" : "↻ Generate Morning Brief"}
              </button>{" "}
              <Link to="/financial-intelligence/sources" className="fi-link">Sources →</Link>
            </span>
          </div>
          <div className="fi-briefing">
            <div className="fi-briefing-date">{briefing.date} — AI-generated briefing</div>
            <p className="fi-briefing-summary">{briefing.summary}</p>
            <div className="fi-briefing-sections">
              {Object.entries(briefing.sections || {}).map(([key, text]) => (
                <div key={key} className="fi-briefing-section">
                  <h3 className="fi-briefing-section-title">{key.replace(/_/g, " ").toUpperCase()}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Portfolio impact */}
      {impact?.available && (
        <div className="fi-section">
          <h2 className="fi-section-title">What Does This Mean for Your Portfolio?</h2>
          <div className="fi-impact-grid">
            <div className="fi-impact-card">
              <div className="fi-impact-num">{impact.potentially_affected}</div>
              <div className="fi-impact-label">Borrowers potentially affected</div>
            </div>
            <div className="fi-impact-card">
              <div className="fi-impact-num">{(impact.high_dti_share * 100).toFixed(1)}%</div>
              <div className="fi-impact-label">High debt-to-income share</div>
            </div>
            <div className="fi-impact-card">
              <div className="fi-impact-num">{impact.manual_review}</div>
              <div className="fi-impact-label">Awaiting manual review</div>
            </div>
            <div className="fi-impact-card">
              <div className="fi-impact-num">
                {Object.entries(impact.by_risk || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </div>
              <div className="fi-impact-label">Risk distribution ({impact.borrowers} borrowers)</div>
            </div>
          </div>
          {(impact.pressures || []).map((p, i) => (
            <div key={i} className={`fi-pressure fi-pressure-${p.level}`}>
              <b>{p.name} — {p.level.toUpperCase()}</b>
              <span>{p.detail}</span>
            </div>
          ))}
          <div className="fi-ai-label">{impact.method}</div>
        </div>
      )}

      {/* Latest news */}
      <div className="fi-section">
        <div className="fi-section-header">
          <h2 className="fi-section-title">Latest Intelligence</h2>
          <Link to="/financial-intelligence/news" className="fi-link">View all →</Link>
        </div>
        <div className="fi-news-list">
          {data.latest_news?.map((n) => (
            <Link key={n.id} to={`/financial-intelligence/news/${n.id}`} className="fi-news-item">
              <div className="fi-news-meta">
                <span className="fi-news-source">{n.source}</span>
                <span className="fi-news-category">{n.category}</span>
                <span className="fi-news-time"><TimeAgo ts={n.published_at} /></span>
              </div>
              <div className="fi-news-title">{n.title}</div>
              {n.lending_impact && <div className="fi-news-impact">Lending: {n.lending_impact}</div>}
              <div className="fi-news-badges">
                <span className="fi-badge" style={{ borderColor: IMPACT_COLORS[n.impact_level] }}>
                  Market: {(n.impact_level || "low").toUpperCase()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
