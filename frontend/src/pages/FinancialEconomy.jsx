import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { finance } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";
import TrendArrow from "../components/ui/TrendArrow";
import "./FinancialEconomy.css";

export default function FinancialEconomy() {
  const { session } = useAuth();
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.token) return;
    finance.economy(session.token)
      .then(setIndicators)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.token]);

  if (loading) return <div className="fi-economy-page"><Skeleton lines={8} /></div>;

  const key = (name) => indicators.find((i) => i.indicator === name);

  const repo = key("repo_rate");
  const infl = key("inflation_cpi");
  const gdp = key("gdp_growth");
  const unemp = key("unemployment");
  const forex = key("forex_reserves");
  const ind10y = key("india_10y_yield");
  const iip = key("industrial_production");
  const credit = key("credit_growth");

  return (
    <div className="fi-economy-page">
      <div className="fi-header">
        <div>
          <h1 className="fi-title">Economic Environment</h1>
          <p className="fi-subtitle">Key Indian economic indicators</p>
        </div>
      </div>

      <div className="fi-econ-grid">
        <IndicatorCard label="Repo Rate" value={repo?.value} unit={repo?.unit} prev={repo?.previous} source={repo?.source} />
        <IndicatorCard label="CPI Inflation" value={infl?.value} unit={infl?.unit} prev={infl?.previous} source={infl?.source} warning={infl?.value > 5} />
        <IndicatorCard label="GDP Growth" value={gdp?.value} unit={gdp?.unit} prev={gdp?.previous} source={gdp?.source} />
        <IndicatorCard label="Unemployment" value={unemp?.value} unit={unemp?.unit} prev={unemp?.previous} source={unemp?.source} />
        <IndicatorCard label="10Y G-Sec Yield" value={ind10y?.value} unit={ind10y?.unit} prev={ind10y?.previous} source={ind10y?.source} />
        <IndicatorCard label="Industrial Production" value={iip?.value} unit={iip?.unit} prev={iip?.previous} source={iip?.source} />
        <IndicatorCard label="Credit Growth" value={credit?.value} unit={credit?.unit} prev={credit?.previous} source={credit?.source} />
        <IndicatorCard label="Forex Reserves" value={forex?.value} unit={forex?.unit} prev={forex?.previous} source={forex?.source} />
      </div>

      <div className="fi-section">
        <h2 className="fi-section-title">All Indicators</h2>
        <div className="fi-econ-table">
          <div className="fi-econ-row fi-econ-header">
            <span>Indicator</span><span>Current</span><span>Previous</span><span>Change</span><span>Source</span>
          </div>
          {indicators.map((ind) => (
            <div key={ind.indicator} className="fi-econ-row">
              <span className="fi-econ-name">{ind.indicator.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
              <span className="fi-econ-value">{ind.value}{ind.unit}</span>
              <span className="fi-econ-prev">{ind.previous}{ind.unit}</span>
              <span className="fi-econ-change">
                <TrendArrow
                  value={ind.value - ind.previous}
                  suffix={ind.unit}
                  invert={["inflation_cpi", "inflation_wholesale", "unemployment"].includes(ind.indicator)}
                />
              </span>
              <span className="fi-econ-source">{ind.source}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IndicatorCard({ label, value, unit, prev, source, warning }) {
  const change = value != null && prev != null ? (value - prev) : null;
  return (
    <div className={`fi-econ-card ${warning ? "fi-econ-warning" : ""}`}>
      <div className="fi-econ-label">{label}</div>
      <div className="fi-econ-val">{value != null ? `${value}${unit}` : "—"}</div>
      {change != null && (
        <div className={`fi-econ-chg ${change >= 0 ? "positive" : "negative"}`}>
          {change >= 0 ? "+" : ""}{change.toFixed(2)}{unit}
        </div>
      )}
      {source && <div className="fi-econ-src">{source}</div>}
    </div>
  );
}
