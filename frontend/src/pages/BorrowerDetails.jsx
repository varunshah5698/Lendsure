import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { borrowers, documents, simulation, inr } from "../lib/api";
import PageHeader from "../components/layout/PageHeader";
import Tabs from "../components/ui/Tabs";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import RiskScore from "../components/risk/RiskScore";
import TrustScoreHero from "../components/risk/TrustScoreHero";
import Gauge from "../components/risk/Gauge";
import CopyButton from "../components/ui/CopyButton";
import { downloadJSON } from "../lib/export";
import DecisionBadge from "../components/risk/DecisionBadge";
import AuditTimeline from "../components/audit/AuditTimeline";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import { SkeletonCard } from "../components/ui/Skeleton";
import "./BorrowerDetails.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "cashflow", label: "Cash Flow" },
  { key: "repayment", label: "Repayment" },
  { key: "documents", label: "Documents" },
  { key: "fraud", label: "Fraud & Trust" },
  { key: "explain", label: "Explainability" },
  { key: "recommend", label: "Recommendation" },
  { key: "audit", label: "Audit" },
];

export default function BorrowerDetails() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");
  const [borrower, setBorrower] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [financials, setFinancials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [b, snaps, a] = await Promise.all([
        borrowers.get(id, session.token),
        borrowers.financials(id, session.token),
        borrowers.analysis(id, session.token).catch(() => null),
      ]);
      setBorrower(b);
      setFinancials(snaps);
      setAnalysis(a);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => { load(); }, [load]);

  const handleTabChange = (key) => {
    setTab(key);
    setSearchParams({ tab: key });
  };

  const reRun = async () => {
    toast.info("Re-running analysis…");
    try {
      await borrowers.analyze(id, session.token);
      await load();
      toast.success("Analysis updated");
    } catch (e) { toast.error("Re-run failed: " + e.message); }
  };

  const toggleEvidence = async () => {
    if (evidenceOpen) { setEvidenceOpen(false); return; }
    try {
      const ev = await borrowers.evidence(id, session.token);
      setEvidence(ev);
      setEvidenceOpen(true);
    } catch (e) { toast.error("Failed to load evidence: " + e.message); }
  };

  if (loading) return (
    <div>
      <PageHeader title="Loading…" />
      <div className="borrower-skeleton"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
    </div>
  );
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!borrower) return null;

  const a = analysis;
  const r = a?.recommendation;
  const fin = a?.financial;

  return (
    <div>
      <div className="bd-back">
        <button className="bd-back-link" onClick={() => navigate("/borrowers")}>← All borrowers</button>
      </div>

      <div className="bd-header">
        <div className="bd-avatar">
          {(borrower.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="bd-info">
          <h1 className="bd-name">{borrower.name} <span className="bd-id">{borrower.borrower_id}</span> <CopyButton text={borrower.borrower_id} label="ID" /></h1>
          <div className="bd-meta">
            <span>📍 {borrower.city}</span>
            <span>💼 <b>{borrower.employment_type}</b> · {borrower.employment_years}y</span>
            <span>🕐 Account {borrower.account_age_months} mo</span>
            <Badge variant={borrower.verification_bucket}>{(borrower.verification_bucket || "").replace(/_/g, " ")}</Badge>
          </div>
        </div>
        <div className="bd-actions">
          <Button variant="secondary" size="sm" onClick={toggleEvidence}>⧉ Evidence</Button>
          <Button variant="secondary" size="sm" onClick={() => {
            downloadJSON(`${id}-analysis.json`, { borrower, analysis, financials });
            toast.success("Analysis exported");
          }}>⤓ Export</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>🖨 Print</Button>
          <Button variant="secondary" size="sm" onClick={async () => {
            const url = window.location.href;
            try {
              if (navigator.share) await navigator.share({ title: borrower.name, url });
              else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
            } catch { /* dismissed */ }
          }}>↗ Share</Button>
          <Button variant="primary" size="sm" onClick={reRun}>↻ Re-run</Button>
        </div>
      </div>

      {a && (
        <TrustScoreHero
          score={a.trust_score}
          confidence={r?.confidence}
          factors={[...(a.factors || [])].sort((x, y) => Math.abs(y.weight ?? y.score ?? 0) - Math.abs(x.weight ?? x.score ?? 0))}
          analysisId={a.id}
        />
      )}

      {a && (
        <div className="bd-hero-metrics">
          <div className="bd-metric">
            <small>REPAYMENT RISK</small>
            <Gauge label="REPAYMENT RISK" value={a.risk_score} display={a.risk_level}
              color={a.risk_level === "LOW" ? "var(--success)" : a.risk_level === "MEDIUM" ? "var(--warning)" : "var(--danger)"} />
          </div>
          <div className="bd-metric">
            <small>FRAUD RISK</small>
            <Gauge label="FRAUD RISK" value={a.fraud_score} display={a.fraud_risk}
              color={a.fraud_risk === "LOW" ? "var(--success)" : a.fraud_risk === "MEDIUM" ? "var(--warning)" : "var(--danger)"} />
          </div>
          <div className="bd-metric">
            <small>CONFIDENCE</small>
            <div className="bd-metric-value">{r?.confidence ?? "—"}%</div>
            <div className="bd-metric-bar"><div className="bd-metric-fill" style={{ width: `${r?.confidence || 0}%`, background: "var(--info)" }} /></div>
          </div>
        </div>
      )}

      {evidenceOpen && evidence && (
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Evidence · Analysis #{evidence.analysis_id}</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(evidence.groups || {}).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 12 }}>
                <h4 style={{ textTransform: "capitalize", margin: "0 0 6px", fontSize: 14 }}>{cat.replace(/_/g, " ")}</h4>
                {items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            ))}
            {!Object.keys(evidence.groups || {}).length && <EmptyState title="No evidence recorded" />}
          </CardContent>
        </Card>
      )}

      <Tabs tabs={TABS} active={tab} onChange={handleTabChange} />

      <div className="bd-tab-content">
        {tab === "overview" && a && (
          <div className="bd-grid">
            <Card>
              <CardHeader><CardTitle>Financial Health</CardTitle><CardDescription>Averages across six months</CardDescription></CardHeader>
              <CardContent>
                <div className="bd-bars">
                  {fin && [
                    ["Income", fin.avg_income, "var(--success)"],
                    ["Expenses", fin.avg_expenses, "var(--warning)"],
                    ["Debt", fin.avg_debt, "var(--danger)"],
                  ].map(([k, v, c]) => (
                    <div key={k} className="bd-bar-row">
                      <span className="bd-bar-label">{k}</span>
                      <div className="bd-bar-track"><div className="bd-bar-fill" style={{ width: `${(v / Math.max(1, fin.avg_income)) * 100}%`, background: c }} /></div>
                      <span className="bd-bar-value">{inr(v)}</span>
                    </div>
                  ))}
                </div>
                {fin && (
                  <div className="bd-grid-2" style={{ marginTop: 14 }}>
                    <div className="bd-stat"><small>Debt-to-income</small><b>{fin.dti}</b></div>
                    <div className="bd-stat"><small>Repayment capacity</small><b>{(fin.repayment_capacity * 100).toFixed(0)}%</b></div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Current Recommendation</CardTitle><CardDescription>{r?.rationale}</CardDescription></CardHeader>
              <CardContent>
                <div className="bd-rec-amount">{inr(r?.recommended_amount)}</div>
                <p className="bd-rec-detail">@ {r?.interest_rate}% · {r?.duration_months} mo · EMI <b>{inr(r?.monthly_payment)}</b></p>
                <DecisionBadge decision={r?.decision} />
                <p style={{ marginTop: 12 }}><button className="link-btn" onClick={() => handleTabChange("recommend")}>Open simulator →</button></p>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "cashflow" && <CashFlowTab financials={financials} />}
        {tab === "repayment" && <RepaymentTab borrower={borrower} fin={fin} />}
        {tab === "documents" && <DocumentsTab borrower={borrower} bid={id} token={session.token} toast={toast} />}
        {tab === "fraud" && <FraudTrustTab analysis={a} />}
        {tab === "explain" && <ExplainTab analysis={a} />}
        {tab === "recommend" && <RecommendTab borrower={borrower} recommendation={r} bid={id} token={session.token} toast={toast} />}
        {tab === "audit" && <AuditTab bid={id} token={session.token} />}
      </div>
    </div>
  );
}

/* --- Sub-tabs --- */

function CashFlowTab({ financials }) {
  if (!financials?.length) return <EmptyState title="No financial data" description="Financial snapshots are not available for this borrower." />;
  const max = Math.max(...financials.map((s) => Math.max(s.income, s.expenses, s.debt)), 1);

  return (
    <Card>
      <CardHeader><CardTitle>Six-Month Analytics</CardTitle></CardHeader>
      <CardContent>
        <div className="cf-legend">
          <span className="cf-legend-item"><span className="cf-dot" style={{ background: "var(--success)" }} />Income</span>
          <span className="cf-legend-item"><span className="cf-dot" style={{ background: "var(--warning)" }} />Expenses</span>
          <span className="cf-legend-item"><span className="cf-dot" style={{ background: "var(--danger)" }} />Debt</span>
        </div>
        <div className="cf-chart">
          {financials.map((s, i) => (
            <div key={i} className="cf-col">
              <div className="cf-bars">
                <div className="cf-bar" style={{ height: `${(s.income / max) * 100}%`, background: "var(--success)" }} title={`Income: ${inr(s.income)}`} />
                <div className="cf-bar" style={{ height: `${(s.expenses / max) * 100}%`, background: "var(--warning)" }} title={`Expenses: ${inr(s.expenses)}`} />
                <div className="cf-bar" style={{ height: `${(s.debt / max) * 100}%`, background: "var(--danger)" }} title={`Debt: ${inr(s.debt)}`} />
              </div>
              <span className="cf-label">{s.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RepaymentTab({ borrower: b, fin }) {
  const rc = fin?.repayment_capacity;
  return (
    <div className="bd-grid">
      <Card>
        <CardHeader><CardTitle>Repayment Capacity</CardTitle></CardHeader>
        <CardContent>
          <div className="bd-rec-amount">{rc != null ? `${(rc * 100).toFixed(1)}%` : "—"}</div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>of monthly income available for repayment</p>
          <div className="bd-metric-bar" style={{ marginTop: 12 }}><div className="bd-metric-fill" style={{ width: `${((rc || 0) * 100)}%`, background: "var(--success)" }} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="bd-ledger">
            {[
              ["Average income", fin?.avg_income != null ? inr(fin.avg_income) : "—"],
              ["Average expenses", fin?.avg_expenses != null ? inr(fin.avg_expenses) : "—"],
              ["Average debt", fin?.avg_debt != null ? inr(fin.avg_debt) : "—"],
              ["Debt-to-income", fin?.dti != null ? fin.dti.toFixed(2) : "—"],
              ["Loan-to-income", fin?.lti != null ? fin.lti.toFixed(2) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="bd-ledger-row"><span>{k}</span><b>{v}</b></div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentsTab({ borrower: b, bid, token, toast }) {
  const [docs, setDocs] = useState([]);
  const [newType, setNewType] = useState("identity");
  const [newFile, setNewFile] = useState("");

  const loadDocs = useCallback(async () => {
    try { setDocs(await documents.list(bid, token)); } catch {}
  }, [bid, token]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const addDoc = async () => {
    if (!newFile.trim()) return toast.error("Enter a file name");
    await documents.create(bid, { doc_type: newType, file_name: newFile.trim() }, token);
    toast.success("Document registered");
    setNewFile("");
    loadDocs();
  };

  const updateStatus = async (docId, status) => {
    await documents.patch(docId, { status }, token);
    toast.success("Document status updated");
    loadDocs();
  };

  const ico = { identity: "🪪", bank_statement: "🏦", income_document: "🧾", salary_slip: "💼", business_document: "🏪" };

  return (
    <Card>
      <CardHeader><CardTitle>Document Center</CardTitle><CardDescription>Verification derived from structured checks</CardDescription></CardHeader>
      <CardContent>
        {docs.length ? docs.map((d) => (
          <div key={d.id} className="doc-row">
            <span className="doc-icon">{ico[d.doc_type] || "📄"}</span>
            <div className="doc-info">
              <b style={{ textTransform: "capitalize" }}>{d.doc_type.replace(/_/g, " ")}</b>
              <small>{d.file_name} · quality {d.quality_score}/100</small>
            </div>
            <Badge variant={d.status}>{d.status.replace(/_/g, " ")}</Badge>
            <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="doc-select">
              <option>needs_review</option><option>verified</option><option>suspicious</option>
            </select>
          </div>
        )) : <EmptyState title="No documents on file" icon="📄" />}

        <div style={{ marginTop: 20 }}>
          <h4 style={{ fontSize: 14, marginBottom: 10 }}>Register document</h4>
          <div className="doc-add-row">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="filter-select">
              <option value="identity">Identity</option>
              <option value="bank_statement">Bank statement</option>
              <option value="income_document">Income document</option>
              <option value="salary_slip">Salary slip</option>
              <option value="business_document">Business document</option>
            </select>
            <input type="text" placeholder="e.g. b10001_bank_statement.pdf" value={newFile} onChange={(e) => setNewFile(e.target.value)} className="filter-search-input" style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={addDoc}>＋ Register</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FraudTrustTab({ analysis: a }) {
  if (!a) return <EmptyState title="No analysis available" />;
  return (
    <div className="bd-grid">
      <Card>
        <CardHeader>
          <CardTitle>Fraud Intelligence</CardTitle>
          <CardDescription>Fraud risk: <Badge variant={a.fraud_risk === "HIGH" ? "HIGH" : a.fraud_risk === "MEDIUM" ? "MEDIUM" : "LOW"}>{a.fraud_risk}</Badge> ({a.fraud_score}/100)</CardDescription>
        </CardHeader>
        <CardContent>
          {a.signals?.length ? a.signals.map((s, i) => (
            <div key={i} className="signal-row">
              <div className="signal-info"><b>{s.title}</b><small>{s.evidence}</small></div>
              <Badge variant={s.severity === "high" ? "HIGH" : s.severity === "medium" ? "MEDIUM" : "LOW"}>{s.severity}</Badge>
            </div>
          )) : <EmptyState title="No fraud signals detected" icon="✓" description="All verification and behavior checks are clean." />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Trust Intelligence · {a.trust_score}/100</CardTitle></CardHeader>
        <CardContent>
          {(a.trust_factors || []).map((f, i) => (
            <div key={i} className="trust-factor">
              <div className="trust-factor-header">
                <span className="trust-factor-name">{f.title}</span>
                <span className="trust-factor-score">{f.score}</span>
              </div>
              <div className="trust-factor-bar"><div className="trust-factor-fill" style={{ width: `${f.score}%`, background: f.score >= 60 ? "var(--success)" : f.score >= 40 ? "var(--warning)" : "var(--danger)" }} /></div>
              <div className="trust-factor-evidence">{f.evidence} <span style={{ color: "var(--text-muted)" }}>· weight {f.weight}%</span></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ExplainTab({ analysis: a }) {
  if (!a) return <EmptyState title="No analysis available" />;
  const up = (a.factors || []).filter((f) => f.impact === "raises").sort((x, y) => y.score * y.weight - x.score * x.weight).slice(0, 4);
  const down = (a.factors || []).filter((f) => f.impact === "lowers").sort((x, y) => x.score * x.weight - y.score * y.weight).slice(0, 4);

  return (
    <div className="bd-grid">
      <Card>
        <CardHeader><CardTitle>{a.risk_level} Repayment Risk — Why?</CardTitle><CardDescription>Risk score {a.risk_score}/100</CardDescription></CardHeader>
        <CardContent>
          <ul className="factor-list">
            {up.map((f, i) => (
              <li key={i} className="factor-item factor-negative">
                <b>{f.title}</b>
                {f.code === "ml_default_model" && <span className="ml-chip">🤖 ML Model</span>}
                <span> — {f.observed}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Positive Signals</CardTitle><CardDescription>What pulls risk down</CardDescription></CardHeader>
        <CardContent>
          <ul className="factor-list">
            {down.map((f, i) => (
              <li key={i} className="factor-item factor-positive">
                <b>{f.title}</b> — {f.observed}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function RecommendTab({ borrower: b, recommendation: r, bid, token, toast }) {
  const [sim, setSim] = useState(null);
  const [amt, setAmt] = useState(r?.recommended_amount || 50000);
  const [rate, setRate] = useState(r?.interest_rate || 12);
  const [dur, setDur] = useState(r?.duration_months || 12);

  const runSim = useCallback(async () => {
    try {
      const s = await simulation.run({ borrower_id: bid, amount: amt, interest_rate: rate, duration_months: dur }, token);
      setSim(s);
    } catch (e) { toast.error("Simulation failed: " + e.message); }
  }, [bid, amt, rate, dur, token]);

  useEffect(() => { runSim(); }, [runSim]);

  return (
    <div>
      <Card>
        <CardHeader><CardTitle>Loan Recommendation</CardTitle><CardDescription>{r?.rationale}</CardDescription></CardHeader>
        <CardContent>
          <div className="rec-grid">
            <div className="rec-cell"><small>Recommended loan</small><b>{inr(r?.recommended_amount)}</b></div>
            <div className="rec-cell"><small>Interest rate</small><b>{r?.interest_rate}%</b></div>
            <div className="rec-cell"><small>Duration</small><b>{r?.duration_months} mo</b></div>
            <div className="rec-cell"><small>Monthly payment</small><b>{inr(r?.monthly_payment)}</b></div>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Total repayment {inr(r?.total_repayment)} · burden {((r?.repayment_burden || 0) * 100).toFixed(0)}% of monthly income
          </p>
          <div className="decision-banner" style={{ marginTop: 12 }}><DecisionBadge decision={r?.decision} /><span style={{ marginLeft: 8 }}>{r?.rationale}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What-If Simulator</CardTitle><CardDescription>Drag the controls — payment, burden and decision update immediately</CardDescription></CardHeader>
        <CardContent>
          <div className="sim-grid">
            <div className="sim-controls">
              <label className="sim-label">Loan amount · <b>{inr(amt)}</b><input type="range" min={5000} max={Math.max(100000, b.requested_amount)} step={1000} value={amt} onChange={(e) => setAmt(+e.target.value)} className="sim-range" /></label>
              <label className="sim-label">Interest rate · <b>{rate}%</b><input type="range" min={5} max={28} step={0.5} value={rate} onChange={(e) => setRate(+e.target.value)} className="sim-range" /></label>
              <label className="sim-label">Duration · <b>{dur} months</b><input type="range" min={1} max={36} step={1} value={dur} onChange={(e) => setDur(+e.target.value)} className="sim-range" /></label>
            </div>
            <div className="sim-results">
              <div className="rec-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="rec-cell"><small>Monthly payment</small><b className="sim-big">{sim ? inr(sim.monthly_payment) : "—"}</b></div>
                <div className="rec-cell"><small>Total repayment</small><b>{sim ? inr(sim.total_repayment) : "—"}</b></div>
                <div className="rec-cell"><small>Repayment burden</small><b style={{ color: sim && sim.repayment_burden * 100 <= 30 ? "var(--success)" : sim && sim.repayment_burden * 100 <= 50 ? "var(--warning)" : "var(--danger)" }}>{sim ? `${(sim.repayment_burden * 100).toFixed(0)}%` : "—"}</b></div>
                <div className="rec-cell"><small>Decision</small><div>{sim ? <DecisionBadge decision={sim.decision} /> : "—"}</div></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab({ bid, token }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    borrowers.audit(bid, token).then(setEvents).catch(() => {}).finally(() => setLoading(false));
  }, [bid, token]);

  if (loading) return <SkeletonCard />;
  return (
    <Card>
      <CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader>
      <CardContent>
        <AuditTimeline events={events} />
      </CardContent>
    </Card>
  );
}
