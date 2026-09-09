import { useMemo } from "react";
import "./Heatmap.css";

function shade(pct) {
  if (pct >= 1) return "hm-strong-up";
  if (pct >= 0) return "hm-up";
  if (pct > -1) return "hm-down";
  return "hm-strong-down";
}

export default function Heatmap({ assets = [], onSelect }) {
  const groups = useMemo(() => {
    const m = {};
    for (const a of assets) {
      const s = a.sector || "Other";
      (m[s] = m[s] || []).push(a);
    }
    return Object.entries(m).map(([sector, list]) => ({
      sector,
      avg: list.reduce((s, a) => s + (a.change_pct || 0), 0) / list.length,
      list: list.sort((x, y) => (y.change_pct || 0) - (x.change_pct || 0)),
    })).sort((a, b) => b.avg - a.avg);
  }, [assets]);

  if (!groups.length) return null;
  return (
    <div className="hm">
      {groups.map((g) => (
        <div key={g.sector} className="hm-sector">
          <div className="hm-sector-head">
            <span>{g.sector}</span>
            <b className={g.avg >= 0 ? "tape-up" : "tape-down"}>
              {g.avg >= 0 ? "+" : ""}{g.avg.toFixed(2)}%
            </b>
          </div>
          <div className="hm-tiles">
            {g.list.map((a) => (
              <button key={a.symbol} className={`hm-tile ${shade(a.change_pct || 0)}`}
                onClick={() => onSelect?.(a.symbol)} title={`${a.name}: ${a.change_pct?.toFixed(2)}%`}>
                <span className="hm-tile-name">{a.name}</span>
                <span className="hm-tile-pct">{a.change_pct >= 0 ? "+" : ""}{a.change_pct?.toFixed(2)}%</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
