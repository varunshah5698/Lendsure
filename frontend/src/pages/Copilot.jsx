import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { copilot } from "../lib/api";
import PageHeader from "../components/layout/PageHeader";
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import Button from "../components/ui/Button";
import { SkeletonCard } from "../components/ui/Skeleton";

const SUGGESTED = [
  "Which loans need attention today?",
  "Show borrowers whose risk increased more than 15%",
  "Why is B10001 high risk?",
  "Tell me about the portfolio",
  "Find suspicious networks around B10003",
];

export default function Copilot() {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]);

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (question.length < 3 || busy) return;
    setBusy(true);
    setQ("");
    try {
      const r = await copilot.ask(question, session.token);
      setTurns((t) => [...t, { q: question, a: r }].slice(-20));
    } catch (e) {
      setTurns((t) => [...t, { q: question, a: { answer: "Request failed: " + e.message, citations: [], tools_used: [] } }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Intelligence Copilot"
        description="Deterministic analyst over live records — every number cites its source. Cannot approve, mutate or bypass permissions."
      />
      <Card>
        <CardContent>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
              placeholder="Ask about risk, rates, changes, networks, loans… (include a borrower ID for specifics)"
              className="filter-search-input"
              style={{ flex: 1 }}
            />
            <Button variant="primary" size="sm" disabled={busy} onClick={() => ask()}>{busy ? "…" : "Ask"}</Button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {SUGGESTED.map((s) => (
              <button key={s} className="link-btn" style={{ fontSize: 12 }} onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {busy && <SkeletonCard />}
        {turns.slice().reverse().map((t, i) => (
          <Card key={i}>
            <CardHeader><CardTitle>{t.q}</CardTitle>
              <CardDescription>
                tools: {(t.a.tools_used || []).join(", ") || "none"} · {t.a.engine || ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: 14, lineHeight: 1.65, margin: "0 0 10px" }}>{t.a.answer}</p>
              {(t.a.citations || []).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {t.a.citations.map((c, j) => (
                    <Link key={j} to={c.link} className="link-btn" style={{ fontSize: 12 }}>↗ {c.label}</Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
