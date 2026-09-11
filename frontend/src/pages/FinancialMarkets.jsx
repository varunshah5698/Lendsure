import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import TrendArrow from "../components/ui/TrendArrow";
import Heatmap from "../components/finance/Heatmap";
import CurrencyConverter from "../components/finance/CurrencyConverter";
import "./FinancialMarkets.css";

const REGIONS = ["all", "IN", "US", "GB", "DE", "JP"];
const TYPES = ["all", "index", "currency", "commodity", "crypto"];

function ageSecs(ts) {
  if (!ts) return null;
  const t = new Date(ts.length === 16 ? ts + ":00" : ts).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

function ageLabel(secs) {
  if (secs == null) return "unknown age";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function FinancialMarkets() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [region, setRegion] = useState("all");
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // re-renders age labels

  const fetchAssets = async (silent) => {
    if (!session?.token) return;
    if (!silent) setLoading(true);
    try {
      setAssets(await finance.markets({ region, asset_type: type }, session.token));
    } catch {}
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { fetchAssets(false); }, [session?.token, region, type]);

  // live refresh: silent re-fetch every 30s while the tab is visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchAssets(true);
    }, 30000);
    return () => clearInterval(id);
  }, [session?.token, region, type]);

  // re-render age labels every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const newest = assets.reduce((m, a) => (!m || (a.updated_at || "") > m ? (a.updated_at || "") : m), "");
  const age = ageSecs(newest);
  const live = age != null && age < 180;

  return (
    <div className="fi-markets-page">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Markets</h1>
          <p className="fi-subtitle">Indian and global market data</p>
        </div>
        <div className="fi-demo-badge" title={live ? "Prices refreshed from Yahoo Finance within the last 3 minutes" : "Provider slow or rate-limited — showing last stored quotes"}>
          <span className="fi-demo-dot" style={{ background: live ? "#22c55e" : "#f59e0b", boxShadow: live ? "0 0 6px #22c55e" : "none" }} />
          {live ? `LIVE · ${ageLabel(age)}` : `STALE · ${ageLabel(age)}`}
        </div>
      </div>

      <div className="fi-markets-filters">
        <div className="fi-chip-group">
          {REGIONS.map((r) => (
            <button key={r} className={`fi-chip ${region === r ? "fi-chip-active" : ""}`}
              onClick={() => setRegion(r)}>
              {r === "all" ? "All Regions" : r}
            </button>
          ))}
        </div>
        <div className="fi-chip-group">
          {TYPES.map((t) => (
            <button key={t} className={`fi-chip ${type === t ? "fi-chip-active" : ""}`}
              onClick={() => setType(t)}>
              {t === "all" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Skeleton lines={6} /> : (
        <>
          <CurrencyConverter assets={assets} />
          <div className="fi-section">
            <h2 className="fi-section-title">Sector Heatmap</h2>
            <Heatmap assets={assets} onSelect={(s) => navigate(`/financial-intelligence/markets/${encodeURIComponent(s)}`)} />
          </div>
          <div className="fi-section">
            <h2 className="fi-section-title">All Assets</h2>
          <div className="fi-markets-grid">
          {assets.map((a) => (
            <Link key={a.symbol} to={`/financial-intelligence/markets/${encodeURIComponent(a.symbol)}`}
              className="fi-market-card">
              <div className="fi-market-header">
                <div className="fi-market-name">{a.name}</div>
                <div className="fi-market-type">{a.asset_type}</div>
              </div>
              <div className="fi-market-price">
                {a.currency === "INR" ? "₹" : "$"}{Number(a.current_price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className={`fi-market-change ${a.change_pct >= 0 ? "positive" : "negative"}`}>
                <TrendArrow value={a.change_pct} />
                <span className="fi-market-abs">
                  ({a.change_abs >= 0 ? "+" : ""}{a.change_abs?.toFixed(2)})
                </span>
              </div>
              <div className="fi-market-details">
                <span>H: {Number(a.day_high).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span>L: {Number(a.day_low).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span>Vol: {(a.volume || 0).toLocaleString()}</span>
              </div>
              <div className="fi-market-age" title="When this quote was stored">updated {ageLabel(ageSecs(a.updated_at))}</div>
            </Link>
          ))}
        </div>
          </div>
        </>
      )}
    </div>
  );
}
