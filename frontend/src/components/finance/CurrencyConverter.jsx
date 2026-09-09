import { useState, useMemo } from "react";
import "./CurrencyConverter.css";

export default function CurrencyConverter({ assets = [] }) {
  const rates = useMemo(() => {
    const m = { INR: 1 };
    for (const a of assets) {
      if (a.asset_type !== "currency" || !a.current_price) continue;
      const code = a.symbol.split("INR")[0].replace("=X", "").replace(/[^A-Z]/g, "");
      if (code) m[code] = a.current_price;
    }
    return m;
  }, [assets]);
  const codes = Object.keys(rates);
  const [amt, setAmt] = useState(1000);
  const [from, setFrom] = useState(codes.includes("USD") ? "USD" : codes[0]);
  const [to, setTo] = useState("INR");
  if (codes.length < 2) return null;
  const result = (Number(amt) || 0) * (rates[from] || 1) / (rates[to] || 1);
  const sym = (c) => (c === "INR" ? "₹" : c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : c === "JPY" ? "¥" : `${c} `);
  return (
    <div className="cc">
      <div className="cc-title">Currency Converter <span className="cc-live">· market rates</span></div>
      <div className="cc-row">
        <input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} className="cc-amt" aria-label="Amount" />
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="cc-sel" aria-label="From currency">
          {codes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="cc-swap" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap currencies">⇄</button>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="cc-sel" aria-label="To currency">
          {codes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="cc-result">{sym(to)}{result.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      <div className="cc-rate">1 {from} = {((rates[from] || 1) / (rates[to] || 1)).toFixed(4)} {to}</div>
    </div>
  );
}
