import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import { useToast } from "../components/ui/Toast";
import Skeleton from "../components/ui/Skeleton";
import SegmentedControl from "../components/ui/SegmentedControl";
import TrendArrow from "../components/ui/TrendArrow";
import "./FinancialMarketDetail.css";

const RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"];

export default function FinancialMarketDetail() {
  const { symbol } = useParams();
  const decoded = symbol ? decodeURIComponent(symbol) : "";
  const { session } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [range, setRange] = useState("3M");
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!session?.token || !decoded) return;
    setLoading(true);
    finance.marketDetail(decoded, range, session.token)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [decoded, range, session?.token]);

  const chart = useMemo(() => {
    const hist = data?.history || [];
    if (hist.length < 2) return null;
    const W = 800, H = 260, P = 28;
    const prices = hist.map((h) => h.price);
    const min = Math.min(...prices), max = Math.max(...prices);
    const span = max - min || 1;
    const pts = hist.map((h, i) => [
      P + (i / (hist.length - 1)) * (W - 2 * P),
      H - P - ((h.price - min) / span) * (H - 2 * P),
    ]);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - P} L${pts[0][0].toFixed(1)},${H - P} Z`;
    const first = prices[0], last = prices[prices.length - 1];
    return { W, H, P, pts, line, area, min, max, up: last >= first, hist };
  }, [data]);

  const addWatch = () => {
    finance.addToWatchlist(decoded, session.token)
      .then(() => toast.success("Added to watchlist"))
      .catch((e) => toast.error(e.message));
  };

  if (loading) return <div className="fi-mdetail-page"><Skeleton lines={8} /></div>;
  if (!data?.asset) return <div className="fi-mdetail-page"><p>Asset not found.</p><Link to="/financial-intelligence/markets" className="fi-link">← Back</Link></div>;
  const a = data.asset;

  return (
    <div className="fi-mdetail-page">
      <Link to="/financial-intelligence/markets" className="fi-back">← Back to Markets</Link>
      <div className="fi-mdetail-header">
        <div>
          <h1 className="fi-title">{a.name}</h1>
          <p className="fi-subtitle">{a.symbol} · {a.sector} · {a.region}</p>
        </div>
        <button className="fi-watch-btn" onClick={addWatch}>+ Watchlist</button>
      </div>

      <div className="fi-mdetail-price-row">
        <div className="fi-mdetail-price">
          {a.currency === "INR" ? "₹" : "$"}{Number(a.current_price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div className={`fi-mdetail-change ${(a.change_pct || 0) >= 0 ? "positive" : "negative"}`}>
          <TrendArrow value={a.change_pct} />
          ({(a.change_abs || 0) >= 0 ? "+" : ""}{(a.change_abs || 0).toFixed(2)})
        </div>
      </div>

      <div className="fi-mdetail-stats">
        {[["Open", a.open_price], ["Day High", a.day_high], ["Day Low", a.day_low], ["Prev Close", a.prev_close], ["Volume", (a.volume || 0).toLocaleString()]].map(([k, v]) => (
          <div key={k} className="fi-mdetail-stat">
            <div className="fi-mdetail-stat-label">{k}</div>
            <div className="fi-mdetail-stat-value">{typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v}</div>
          </div>
        ))}
      </div>

      <div className="fi-mdetail-chart-card">
        <div className="fi-range-row">
          <SegmentedControl options={RANGES} value={range} onChange={setRange} />
        </div>
        {chart ? (
          <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="fi-chart"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * chart.W;
              const idx = Math.round(((x - chart.P) / (chart.W - 2 * chart.P)) * (chart.hist.length - 1));
              if (idx >= 0 && idx < chart.hist.length) setHover(idx);
            }}
            onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="fiArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.up ? "#10b981" : "#ef4444"} stopOpacity="0.35" />
                <stop offset="100%" stopColor={chart.up ? "#10b981" : "#ef4444"} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={chart.P} x2={chart.W - chart.P} y1={chart.H * f} y2={chart.H * f}
                stroke="rgba(148,163,184,.15)" strokeWidth="1" />
            ))}
            <path d={chart.area} fill="url(#fiArea)" />
            <path d={chart.line} fill="none" stroke={chart.up ? "#10b981" : "#ef4444"} strokeWidth="2" />
            {hover != null && chart.pts[hover] && (
              <g>
                <circle cx={chart.pts[hover][0]} cy={chart.pts[hover][1]} r="4"
                  fill={chart.up ? "#10b981" : "#ef4444"} />
                <line x1={chart.pts[hover][0]} x2={chart.pts[hover][0]} y1={chart.P} y2={chart.H - chart.P}
                  stroke="rgba(148,163,184,.4)" strokeWidth="1" strokeDasharray="4 3" />
              </g>
            )}
          </svg>
        ) : <div className="fi-empty">Not enough history for this range.</div>}
        {hover != null && chart?.hist[hover] && (
          <div className="fi-chart-tip">
            {new Date(chart.hist[hover].ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            {" · "}{Number(chart.hist[hover].price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        )}
      </div>

      {data.related_news?.length > 0 && (
        <div className="fi-section">
          <h2 className="fi-section-title">Related News</h2>
          <div className="fi-news-list">
            {data.related_news.map((n) => (
              <Link key={n.id} to={`/financial-intelligence/news/${n.id}`} className="fi-news-item">
                <div className="fi-news-meta">
                  <span className="fi-news-source">{n.source}</span>
                  <span className="fi-news-category">{n.category}</span>
                </div>
                <div className="fi-news-title">{n.title}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
