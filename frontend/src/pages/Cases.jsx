import { useState, useEffect, useCallback } from "react";
import { useAuth, guardLender, isGuest } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { cases } from "../lib/api";
import PageHeader from "../components/layout/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { SkeletonTable } from "../components/ui/Skeleton";
import ErrorState from "../components/ui/ErrorState";
import EmptyState from "../components/ui/EmptyState";

export default function Cases() {
  const { session } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [bid, setBid] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setRows(await cases.list({ status: filter || undefined }, session.token));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filter, session?.token]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!guardLender(session, toast)) return;
    if (title.trim().length < 4) return toast.error("Give the case a title");
    try {
      await cases.create({ title: title.trim(), borrower_id: bid.trim() }, session.token);
      toast.success("Case opened");
      setOpen(false);
      setTitle("");
      setBid("");
      load();
    } catch (e) { toast.error("Create failed: " + e.message); }
  };

  const resolve = async (id) => {
    if (!guardLender(session, toast)) return;
    try {
      await cases.resolve(id, session.token);
      toast.success("Case resolved");
      load();
    } catch (e) { toast.error("Resolve failed: " + e.message); }
  };

  const guest = isGuest(session);
  return (
    <div>
      <PageHeader
        title="Investigation Cases"
        description="Graph and fraud findings become tracked, resolvable cases"
        actions={<Button variant="primary" size="sm" disabled={guest} title={guest ? "Sign in with Phone OTP" : "Open a case"} onClick={() => setOpen(true)}>＋ Open case</Button>}
      />
      <Card padding="sm">
        <div className="filters-row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
            <option value="">All</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
        {loading ? <SkeletonTable rows={6} cols={5} /> :
          error ? <ErrorState message={error} onRetry={load} /> :
          !rows.length ? <EmptyState title="No cases" description="Create one from a graph finding or fraud signal." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Case</th><th>Borrower</th><th>Status</th><th>Opened</th><th></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><b>#{c.id} {c.title}</b> <span style={{ color: "var(--text-muted)", fontSize: 12 }}>· {c.kind}</span></td>
                    <td>{c.borrower_id || "—"}</td>
                    <td><Badge variant={c.status === "OPEN" ? "MEDIUM" : "APPROVE"}>{c.status}</Badge></td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{(c.created_at || "").slice(0, 16).replace("T", " ")} · {c.created_by}</td>
                    <td>{c.status === "OPEN" && <Button variant="ghost" size="sm" disabled={guest} onClick={() => resolve(c.id)}>Resolve</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Open investigation case"
        actions={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={create}>Open case</Button></>}>
        <label className="review-note-label">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="filter-search-input" placeholder="e.g. Shared device across 3 borrowers" />
        <label className="review-note-label" style={{ marginTop: 10 }}>Borrower ID (optional)</label>
        <input value={bid} onChange={(e) => setBid(e.target.value)} className="filter-search-input" placeholder="e.g. B10003" />
      </Modal>
    </div>
  );
}
