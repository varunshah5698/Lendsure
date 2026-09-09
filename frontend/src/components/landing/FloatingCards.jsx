import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import "./FloatingCards.css";

const CARDS = [
  { label: "TRUST SCORE", value: "96", sub: "EXCELLENT", color: "var(--success)" },
  { label: "REPAYMENT RISK", value: "LOW", sub: "P(default) < 8%", color: "var(--success)" },
  { label: "FRAUD RISK", value: "LOW", sub: "0 high signals", color: "var(--success)" },
  { label: "MODEL CONFIDENCE", value: "97%", sub: "66 features analyzed", color: "var(--primary)" },
  { label: "DECISION", value: "APPROVE", sub: "High confidence", color: "var(--primary)" },
];

export default function FloatingCards() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="floating-cards">
      {CARDS.map((card, i) => (
        <motion.div
          key={card.label}
          className="floating-card"
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.2 * i, duration: 0.6, ease: "easeOut" }}
        >
          <div className="fc-label">{card.label}</div>
          <div className="fc-value" style={{ color: card.color }}>{card.value}</div>
          <div className="fc-sub">{card.sub}</div>
        </motion.div>
      ))}
    </div>
  );
}
