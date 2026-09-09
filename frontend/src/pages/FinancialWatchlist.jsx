import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import { downloadCSV } from "../lib/export";
import Skeleton from "../components/ui/Skeleton";
import "./FinancialWatchlist.css";

export default function FinancialWatchlist() {
  const { session } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!session?.token) return;
    setLoading(true);
    finance.watchlist(session.token)
      .then((d) => setItems(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [session?.token]);

  const remove = (symbol) => {
    finance.removeFromWatchlist(symbol, session.token).then(load);
  };

  if (loading) return <div className="fi-watchlist-page"><Skeleton lines={5} /></div>;

  return (
    <div className="fi-watchlist-page">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">My Watchlist</h1>
          <p className="fi-subtitle">Track assets that matter to your lending environment</p>
        </div>
        {items.length > 0 && (
          <button
            className="kit-page-btn"
            onClick={() => downloadCSV("watchlist.csv", items.map((i) => ({
              symbol: i.symbol, name: i.name, price: i.current_price,
              change_pct: i.change_pct, type: i.asset_type, sector: i.sector,
            })))}
          >
            ⤓ Export CSV
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="fi-empty-state">
          <div className="fi-empty-icon">📋</div>
          <h3>Your watchlist is empty</h3>
          <p>Add assets from the <Link to="/financial-intelligence/markets">Markets</Link> page to track them here.</p>
        </div>
      ) : (
        <div className="fi-watchlist-grid">
          {items.map((item) => (
            <div key={item.symbol} className="fi-watchlist-item">
              <div className="fi-wl-header">
                <Link to={`/financial-intelligence/markets/${encodeURIComponent(item.symbol)}`} className="fi-wl-name">
                  {item.name || item.symbol}
                </Link>
                <button className="fi-wl-remove" onClick={() => remove(item.symbol)} title="Remove">✕</button>
              </div>
              <div className="fi-wl-price">
                {item.currency === "INR" ? "₹" : "$"}
                {Number(item.current_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className={`fi-wl-change ${(item.change_pct || 0) >= 0 ? "positive" : "negative"}`}>
                {(item.change_pct || 0) >= 0 ? "+" : ""}{(item.change_pct || 0).toFixed(2)}%
              </div>
              <div className="fi-wl-meta">
                <span>{item.asset_type}</span>
                <span>{item.sector}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
