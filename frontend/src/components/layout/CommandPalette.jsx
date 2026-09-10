import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./CommandPalette.css";

const ROUTES = [
  { label: "Dashboard", path: "/dashboard", hint: "overview" },
  { label: "Borrowers", path: "/borrowers", hint: "G B" },
  { label: "Loan Requests", path: "/loan-requests", hint: "G L" },
  { label: "Loans", path: "/loans", hint: "" },
  { label: "Cases", path: "/cases", hint: "" },
  { label: "Copilot", path: "/copilot", hint: "" },
  { label: "Simulations", path: "/simulations", hint: "" },
  { label: "Risk Intelligence", path: "/financial-intelligence", hint: "G R" },
  { label: "Fraud Intelligence", path: "/borrowers", hint: "G F" },
  { label: "Graph Intelligence", path: "/financial-intelligence", hint: "G G" },
  { label: "Financial Intelligence", path: "/financial-intelligence", hint: "" },
  { label: "Approvals", path: "/admin/approvals", hint: "" },
  { label: "Background Jobs", path: "/admin/jobs", hint: "" },
  { label: "Model Performance", path: "/admin/model", hint: "" },
  { label: "Security Center", path: "/security", hint: "" },
];

/** Global command palette (Cmd/Ctrl+K) + G-key sequences + Esc. */
export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const gRef = useRef(false);
  const gTimer = useRef(null);

  useEffect(() => {
    const armG = () => {
      gRef.current = true;
      clearTimeout(gTimer.current);
      gTimer.current = setTimeout(() => { gRef.current = false; }, 700);
    };
    const h = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setSel(0);
        return;
      }
      if (e.key === "Escape") {
        if (open) setOpen(false);
        return;
      }
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
      if (mod) return;
      const k = e.key.toLowerCase();
      if (gRef.current) {
        gRef.current = false;
        const map = { b: "/borrowers", l: "/loan-requests", r: "/financial-intelligence", g: "/financial-intelligence", f: "/borrowers" };
        if (map[k]) navigate(map[k]);
        return;
      }
      if (k === "g") armG();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [navigate, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open ]);

  if (!open) return null;
  const ql = q.toLowerCase();
  const bidMatch = q.match(/^\s*([A-Za-z]{1,4}-?\d{1,6})\s*$/);
  const items = ROUTES.filter((r) => !ql || r.label.toLowerCase().includes(ql) || r.hint.toLowerCase().includes(ql)).slice(0, 9);

  const go = (path) => {
    setOpen(false);
    setQ("");
    navigate(path);
  };

  return (
    <div className="cmd-overlay" onClick={() => setOpen(false)}>
      <div className="cmd-box" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - (bidMatch ? 0 : 1))); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") {
              if (bidMatch) go(`/borrower/${bidMatch[1].toUpperCase()}`);
              else if (items[sel]) go(items[sel].path);
            }
          }}
          placeholder="Type a command, route, or borrower ID (e.g. B10001)…"
          className="cmd-input"
        />
        <div className="cmd-list">
          {bidMatch && (
            <button className={`cmd-item ${sel === 0 ? "cmd-active" : ""}`} onClick={() => go(`/borrower/${bidMatch[1].toUpperCase()}`)}>
              <span>👤 Open borrower {bidMatch[1].toUpperCase()}</span>
            </button>
          )}
          {items.map((r, i) => (
            <button key={r.path + r.label} className={`cmd-item ${!bidMatch && sel === i ? "cmd-active" : ""}`}
              onClick={() => go(r.path)}>
              <span>{r.label}</span>
              {r.hint && <kbd>{r.hint}</kbd>}
            </button>
          ))}
          {!items.length && !bidMatch && <div className="cmd-empty">No matches</div>}
        </div>
        <div className="cmd-foot">⌘K toggle · ↑↓ navigate · Enter open · Esc close · G then B/L/R/G/F jump</div>
      </div>
    </div>
  );
}
