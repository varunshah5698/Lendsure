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

export default function FinancialMarkets() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [region, setRegion] = useState("all");
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.token) return;
    setLoading(true);
    finance.markets({ region, asset_type: type }, session.token)
      .then(setAssets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.token, region, type]);

  return (
    <div className="fi-markets-page">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Markets</h1>
          <p className="fi-subtitle">Indian and global market data</p>
        </div>
        <div className="fi-demo-badge"><span className="fi-demo-dot" /> DEMO FEED</div>
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
            </Link>
          ))}
        </div>
          </div>
        </>
      )}
    </div>
  );
}
