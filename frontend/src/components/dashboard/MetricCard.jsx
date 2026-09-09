import { useEffect, useRef } from "react";
import "./MetricCard.css";

export default function MetricCard({ label, value, sub, trend, variant = "default", icon }) {
  const ref = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (ref.current && !hasAnimated.current) {
      hasAnimated.current = true;
      ref.current.style.opacity = "0";
      ref.current.style.transform = "translateY(6px)";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ref.current.style.transition = "all .3s ease";
          ref.current.style.opacity = "1";
          ref.current.style.transform = "none";
        });
      });
    }
  }, []);

  return (
    <div className={`metric-card metric-${variant}`} ref={ref}>
      <div className="metric-top">
        {icon && <span className="metric-icon">{icon}</span>}
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value">{value ?? "—"}</div>
      {sub && <div className="metric-sub">{sub}</div>}
      {trend && <div className={`metric-trend ${trend > 0 ? "trend-up" : "trend-down"}`}>
        {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
      </div>}
    </div>
  );
}
