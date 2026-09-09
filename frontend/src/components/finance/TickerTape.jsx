import "./TickerTape.css";

export default function TickerTape({ items = [] }) {
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <div className="tape" aria-label="Market ticker">
      <div className="tape-track">
        {row.map((a, i) => (
          <span key={`${a.symbol}-${i}`} className="tape-item">
            <b>{a.name}</b>
            <span className={a.change_pct >= 0 ? "tape-up" : "tape-down"}>
              {typeof a.price === "number" ? a.price.toLocaleString() : a.price}{" "}
              ({a.change_pct >= 0 ? "+" : ""}{a.change_pct?.toFixed(2)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
