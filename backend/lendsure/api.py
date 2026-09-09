"""LendSure REST API — borrowers, analysis, evidence, documents, audit, admin."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .engines import RecommendationEngine, emi, full_analysis
from .schema import DEFAULT_CONFIG

router = APIRouter(prefix="/api/ls", tags=["lendsure"])

_DB = None
_RESOLVE = lambda auth: None  # noqa: E731


def configure(db_factory, session_resolver):
    global _DB, _RESOLVE
    _DB = db_factory
    _RESOLVE = session_resolver


def now() -> str:
    return datetime.utcnow().isoformat()


def cfg_all(conn) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    for r in conn.execute("SELECT key, value FROM ls_config"):
        try:
            cfg[r["key"]] = json.loads(r["value"])
        except Exception:
            pass
    return cfg


def verification_bucket(b: dict, docs: list[dict]) -> str:
    statuses = [d["status"] for d in docs]
    if "suspicious" in statuses or b["id_verification"] == 0:
        return "suspicious"
    if b["id_verification"] == 2 and b["address_verification"] == 2 and b["phone_verification"] == 2 \
            and docs and all(s == "verified" for s in statuses):
        return "verified"
    return "needs_review"


def latest_analyses(conn) -> dict:
    out = {}
    for r in conn.execute(
            "SELECT a.* FROM ls_analyses a JOIN (SELECT borrower_id, MAX(id) m FROM ls_analyses GROUP BY borrower_id) x "
            "ON x.borrower_id=a.borrower_id AND x.m=a.id"):
        out[r["borrower_id"]] = dict(r)
    return out


def actor_of(authorization: Optional[str], x_api_key: Optional[str] = None) -> str:
    s = _RESOLVE(authorization) if authorization else None
    if s:
        return f"{s['display_name']} ({s['phone']})"
    if x_api_key:
        import hashlib
        h = hashlib.sha256(x_api_key.encode()).hexdigest()
        conn = _DB()
        try:
            row = conn.execute("SELECT * FROM ls_api_keys WHERE key_hash=? AND revoked=0", (h,)).fetchone()
            if row:
                conn.execute("UPDATE ls_api_keys SET last_used=? WHERE id=?", (now(), row["id"]))
                conn.commit()
                return f"{row['name']} [api-key {row['prefix']}]"
        finally:
            conn.close()
    return "anonymous"


# ---------------- authorization (centralized RBAC) ----------------
# Guests may explore, analyze and simulate (demo-safe). Governance mutations
# (policy, reviews, keys, sessions, document verification) require the lender
# or service (API-key) role. Every check below goes through require_perm —
# never inline `role == ...` comparisons in endpoints.
ROLE_PERMS = {
    "guest": {"borrower.read", "analysis.read", "analysis.run", "simulation.run",
              "finance.read", "admin.read"},
    "lender": {"borrower.read", "borrower.create", "analysis.read", "analysis.run",
               "simulation.run", "finance.read", "admin.read",
               "documents.write", "policy.update", "review.decide",
               "keys.manage", "sessions.revoke"},
    "service": {"borrower.read", "borrower.create", "analysis.read", "analysis.run",
                "simulation.run", "finance.read", "admin.read",
                "documents.write", "policy.update", "review.decide",
                "keys.manage", "sessions.revoke"},
}


def role_of(authorization: Optional[str], x_api_key: Optional[str] = None) -> str:
    if x_api_key:
        import hashlib
        h = hashlib.sha256(x_api_key.encode()).hexdigest()
        conn = _DB()
        try:
            if conn.execute("SELECT 1 FROM ls_api_keys WHERE key_hash=? AND revoked=0", (h,)).fetchone():
                return "service"
        finally:
            conn.close()
    s = _RESOLVE(authorization) if authorization else None
    if s:
        return s.get("role") or "guest"
    return "guest"


def require_perm(authorization: Optional[str], x_api_key: Optional[str], *perms: str) -> str:
    role = role_of(authorization, x_api_key)
    if not any(p in ROLE_PERMS.get(role, set()) for p in perms):
        raise HTTPException(403, f"Insufficient permissions for role '{role}' (needs: {', '.join(perms)})")
    return role


class ApiKeyIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)


@router.get("/admin/keys")
def list_keys(authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "keys.manage")
    conn = _DB()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT id, prefix, name, created_at, last_used, revoked FROM ls_api_keys ORDER BY id DESC")]
    finally:
        conn.close()


@router.post("/admin/keys")
def create_key(item: ApiKeyIn, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "keys.manage")
    import hashlib
    import secrets
    raw = "ls_" + secrets.token_urlsafe(32)
    h = hashlib.sha256(raw.encode()).hexdigest()
    conn = _DB()
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO ls_api_keys (key_hash, prefix, name, created_at, revoked) VALUES (?,?,?,?,0)",
                    (h, raw[:10] + "…", item.name.strip(), now()))
        conn.commit()
        return {"id": cur.lastrowid, "key": raw,
                "warning": "Copy now — the full key is never stored and cannot be shown again."}
    finally:
        conn.close()


@router.post("/admin/keys/{key_id}/revoke")
def revoke_key(key_id: int, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "keys.manage")
    conn = _DB()
    try:
        conn.execute("UPDATE ls_api_keys SET revoked=1 WHERE id=?", (key_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------------- dashboard ----------------

@router.get("/dashboard/metrics")
def dashboard_metrics():
    conn = _DB()
    try:
        borrowers = [dict(r) for r in conn.execute("SELECT * FROM ls_borrowers")]
        if not borrowers:
            return {"empty": True}
        analyses = latest_analyses(conn)
        docs_by: dict[str, list] = {}
        for d in conn.execute("SELECT * FROM ls_documents"):
            docs_by.setdefault(d["borrower_id"], []).append(dict(d))
        risks = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
        ver = {"verified": 0, "needs_review": 0, "suspicious": 0}
        fraud_high = 0
        buckets = []
        for b in borrowers:
            a = analyses.get(b["borrower_id"], {})
            rl = a.get("risk_level", "MEDIUM")
            risks[rl] = risks.get(rl, 0) + 1
            vb = verification_bucket(b, docs_by.get(b["borrower_id"], []))
            ver[vb] += 1
            if a.get("fraud_risk") == "HIGH":
                fraud_high += 1
            buckets.append((b, a, vb))
        n = len(borrowers)
        recent = sorted(
            ((b, analyses[b["borrower_id"]]) for b in borrowers if b["borrower_id"] in analyses),
            key=lambda t: t[1]["id"], reverse=True)[:8]
        return {
            "borrowers": n,
            "low_risk": risks["LOW"], "medium_risk": risks["MEDIUM"], "high_risk": risks["HIGH"],
            "fraud_high": fraud_high,
            "pending_verification": ver["needs_review"] + ver["suspicious"],
            "risk_distribution": risks, "verification": ver,
            "avg_income": round(sum(b["avg_income_6m"] for b in borrowers) / n),
            "avg_expenses": round(sum(b["avg_expenses_6m"] for b in borrowers) / n),
            "avg_debt": round(sum(b["avg_debt_6m"] for b in borrowers) / n),
            "total_transactions": sum(b["total_transactions_6m"] for b in borrowers),
            "recent": [{
                "borrower_id": b["borrower_id"], "name": b["name"],
                "trust": a.get("trust_score"), "risk": a.get("risk_level"),
                "fraud": a.get("fraud_risk"), "requested": b["requested_amount"],
                "recommended": a.get("recommended_amount"), "decision": a.get("decision"),
                "confidence": a.get("confidence")} for b, a in recent],
        }
    finally:
        conn.close()


@router.get("/dashboard/trends")
def dashboard_trends():
    """Portfolio monthly averages across all borrowers — powers animated charts."""
    conn = _DB()
    try:
        rows = [dict(r) for r in conn.execute(
            """SELECT label, AVG(income) income, AVG(expenses) expenses, AVG(debt) debt,
                      AVG(transactions) txns, SUM(bounced) bounced, SUM(disputed) disputed,
                      COUNT(*) n
               FROM ls_financials GROUP BY month ORDER BY month""")]
        return rows
    finally:
        conn.close()


# ---------------- borrowers ----------------
@router.get("/borrowers")
def list_borrowers(q: str = "", risk: str = "all", verification: str = "all",
                   city: str = "all", employment: str = "all",
                   sort: str = "trust_desc", page: int = 1, page_size: int = 12):
    page_size = max(1, min(page_size, 50))
    conn = _DB()
    try:
        borrowers = [dict(r) for r in conn.execute("SELECT * FROM ls_borrowers")]
        analyses = latest_analyses(conn)
        docs_by: dict[str, list] = {}
        for d in conn.execute("SELECT * FROM ls_documents"):
            docs_by.setdefault(d["borrower_id"], []).append(dict(d))
        rows = []
        ql = q.strip().lower()
        for b in borrowers:
            a = analyses.get(b["borrower_id"], {})
            vb = verification_bucket(b, docs_by.get(b["borrower_id"], []))
            if ql and ql not in f"{b['borrower_id']} {b['name']} {b['city']}".lower():
                continue
            if risk != "all" and a.get("risk_level") != risk:
                continue
            if verification != "all" and vb != verification:
                continue
            if city != "all" and b["city"] != city:
                continue
            if employment != "all" and b["employment_type"] != employment:
                continue
            rows.append({
                "borrower_id": b["borrower_id"], "name": b["name"], "age": b["age"],
                "city": b["city"], "employment": b["employment_type"], "income": b["avg_income_6m"],
                "requested": b["requested_amount"], "trust": a.get("trust_score"),
                "risk": a.get("risk_level"), "fraud": a.get("fraud_risk"),
                "verification": vb, "decision": a.get("decision")})
        keys = {"trust_desc": (lambda r: -(r["trust"] or -1)), "trust_asc": (lambda r: (r["trust"] if r["trust"] is not None else 999)),
                "requested_desc": (lambda r: -r["requested"]), "requested_asc": (lambda r: r["requested"]),
                "name_asc": (lambda r: r["name"])}
        rows.sort(key=keys.get(sort, keys["trust_desc"]))
        total = len(rows)
        page = max(1, page)
        return {"total": total, "page": page, "page_size": page_size,
                "rows": rows[(page - 1) * page_size: page * page_size],
                "facets": {"cities": sorted({b["city"] for b in borrowers}),
                           "employments": sorted({b["employment_type"] for b in borrowers})}}
    finally:
        conn.close()


@router.get("/borrowers/{bid}")
def get_borrower(bid: str):
    conn = _DB()
    try:
        b = conn.execute("SELECT * FROM ls_borrowers WHERE borrower_id=?", (bid,)).fetchone()
        if not b:
            raise HTTPException(404, "Borrower not found")
        b = dict(b)
        docs = [dict(r) for r in conn.execute("SELECT * FROM ls_documents WHERE borrower_id=?", (bid,))]
        b["verification_bucket"] = verification_bucket(b, docs)
        b["documents"] = docs
        return b
    finally:
        conn.close()


@router.get("/borrowers/{bid}/financials")
def get_financials(bid: str):
    conn = _DB()
    try:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM ls_financials WHERE borrower_id=? ORDER BY month", (bid,))]
        if not rows:
            raise HTTPException(404, "Borrower not found")
        return rows
    finally:
        conn.close()


# ---------------- analysis ----------------

def _persist_analysis(conn, bid: str, res: dict, actor: str) -> int:
    r, fr, t, rec = res["risk"], res["fraud"], res["trust"], res["recommendation"]
    cur = conn.cursor()
    ts = now()
    cur.execute(
        """INSERT INTO ls_analyses (borrower_id, model_version, risk_score, risk_level, fraud_score,
           fraud_risk, trust_score, confidence, decision, recommended_amount, interest_rate,
           duration_months, monthly_payment, ml_score, risk_factors, fraud_signals, trust_factors,
           input_snapshot, created_at, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (bid, res.get("model_version", DEFAULT_CONFIG["model_version"]), r["risk_score"], r["risk_level"], fr["fraud_score"],
         fr["fraud_risk"], t["trust_score"], rec["confidence"], rec["decision"], rec["recommended_amount"],
         rec["interest_rate"], rec["duration_months"], rec["monthly_payment"], res.get("ml_proba"),
         json.dumps(r["factors"]), json.dumps(fr["signals"]), json.dumps(t["trust_factors"]),
         res["input_snapshot"], ts, actor))
    aid = cur.lastrowid
    cur.execute(
        """INSERT INTO ls_recommendations (analysis_id, borrower_id, recommended_amount, interest_rate,
           duration_months, monthly_payment, total_repayment, decision, rationale, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (aid, bid, rec["recommended_amount"], rec["interest_rate"], rec["duration_months"],
         rec["monthly_payment"], rec["total_repayment"], rec["decision"], rec["rationale"], ts))
    for e in res["evidence"]:
        cur.execute("INSERT INTO ls_evidence (analysis_id, category, label, value, sort) VALUES (?,?,?,?,?)",
                    (aid, e["category"], e["label"], e["value"], e["sort"]))
    cur.execute("INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)",
                (bid, aid, actor, "analysis_completed",
                 json.dumps({"risk": r["risk_level"], "fraud": fr["fraud_risk"], "trust": t["trust_score"],
                             "decision": rec["decision"], "model": DEFAULT_CONFIG["model_version"]}), ts))
    conn.commit()
    return aid


@router.post("/borrowers/{bid}/analyze")
def analyze_borrower(bid: str, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    conn = _DB()
    try:
        b = conn.execute("SELECT * FROM ls_borrowers WHERE borrower_id=?", (bid,)).fetchone()
        if not b:
            raise HTTPException(404, "Borrower not found")
        b = dict(b)
        snaps = [dict(r) for r in conn.execute("SELECT * FROM ls_financials WHERE borrower_id=? ORDER BY month", (bid,))]
        docs = [dict(r) for r in conn.execute("SELECT * FROM ls_documents WHERE borrower_id=?", (bid,))]
        dup = conn.execute("SELECT COUNT(*) c FROM ls_borrowers WHERE borrower_id != ? AND borrower_id IN "
                           "(SELECT borrower_id FROM ls_borrowers GROUP BY borrower_id HAVING COUNT(*)>1)",
                           (bid,)).fetchone()["c"] > 0
        res = full_analysis(b, snaps, docs, dup, cfg_all(conn))
        aid = _persist_analysis(conn, bid, res, actor_of(authorization, x_api_key))
        return {"analysis_id": aid, **{k: v for k, v in res.items() if k != "input_snapshot"}}
    finally:
        conn.close()


def _latest_full(conn, bid: str) -> dict:
    a = conn.execute("SELECT * FROM ls_analyses WHERE borrower_id=? ORDER BY id DESC LIMIT 1", (bid,)).fetchone()
    if not a:
        raise HTTPException(404, "No analysis yet — run analysis first")
    a = dict(a)
    rec = conn.execute("SELECT * FROM ls_recommendations WHERE analysis_id=?", (a["id"],)).fetchone()
    ev = [dict(r) for r in conn.execute(
        "SELECT category, label, value FROM ls_evidence WHERE analysis_id=? ORDER BY category, sort", (a["id"],))]
    snap = json.loads(a["input_snapshot"])
    fin = {k: snap.get(k) for k in ("avg_income_6m", "avg_expenses_6m", "avg_debt_6m")}
    inc = fin["avg_income_6m"] or 1
    out = dict(a)
    rec_d = dict(rec) if rec else None
    if rec_d is not None:
        # confidence lives on the analysis; burden is derived from stored inputs
        rec_d["confidence"] = a["confidence"]
        _inc = (snap.get("avg_income_6m") or snap.get("monthly_income") or 0) or 1
        rec_d["repayment_burden"] = round((rec_d.get("monthly_payment") or 0) / _inc, 3)
    out["recommendation"] = rec_d
    out["evidence"] = ev
    out["ml_proba"] = a["ml_score"]
    try:
        out["factors"] = json.loads(a["risk_factors"] or "[]")
        out["signals"] = json.loads(a["fraud_signals"] or "[]")
        out["trust_factors"] = json.loads(a["trust_factors"] or "[]")
    except Exception:
        out["factors"], out["signals"], out["trust_factors"] = [], [], []
    out["financial"] = {
        "avg_income": fin["avg_income_6m"], "avg_expenses": fin["avg_expenses_6m"], "avg_debt": fin["avg_debt_6m"],
        "dti": round(fin["avg_debt_6m"] / inc, 3), "lti": round(snap.get("requested_amount", 0) / inc, 2),
        "repayment_capacity": round((fin["avg_income_6m"] - fin["avg_expenses_6m"]) / inc, 3)}
    return out


@router.get("/borrowers/{bid}/analysis")
def get_analysis(bid: str):
    conn = _DB()
    try:
        return _latest_full(conn, bid)
    finally:
        conn.close()


@router.get("/borrowers/{bid}/evidence")
def get_evidence(bid: str):
    conn = _DB()
    try:
        a = conn.execute("SELECT id FROM ls_analyses WHERE borrower_id=? ORDER BY id DESC LIMIT 1", (bid,)).fetchone()
        if not a:
            raise HTTPException(404, "No analysis yet")
        rows = [dict(r) for r in conn.execute(
            "SELECT category, label, value FROM ls_evidence WHERE analysis_id=? ORDER BY category, sort", (a["id"],))]
        grouped: dict[str, list] = {}
        for r in rows:
            grouped.setdefault(r["category"], []).append({"label": r["label"], "value": r["value"]})
        return {"analysis_id": a["id"], "groups": grouped}
    finally:
        conn.close()


@router.get("/borrowers/{bid}/recommendation")
def get_recommendation(bid: str):
    conn = _DB()
    try:
        a = conn.execute("SELECT id FROM ls_analyses WHERE borrower_id=? ORDER BY id DESC LIMIT 1", (bid,)).fetchone()
        if not a:
            raise HTTPException(404, "No analysis yet")
        r = conn.execute("SELECT * FROM ls_recommendations WHERE analysis_id=?", (a["id"],)).fetchone()
        return dict(r)
    finally:
        conn.close()


class SimulateIn(BaseModel):
    borrower_id: str
    amount: float = Field(gt=0)
    interest_rate: float = Field(ge=0, le=60)
    duration_months: int = Field(ge=1, le=60)


@router.post("/recommendations/simulate")
def simulate(sim: SimulateIn, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    conn = _DB()
    try:
        b = conn.execute("SELECT * FROM ls_borrowers WHERE borrower_id=?", (sim.borrower_id,)).fetchone()
        if not b:
            raise HTTPException(404, "Borrower not found")
        b = dict(b)
        snaps = [dict(r) for r in conn.execute("SELECT * FROM ls_financials WHERE borrower_id=? ORDER BY month", (sim.borrower_id,))]
        docs = [dict(r) for r in conn.execute("SELECT * FROM ls_documents WHERE borrower_id=?", (sim.borrower_id,))]
        res = full_analysis(b, snaps, docs, False, cfg_all(conn))
        rec = RecommendationEngine.run(b, res["risk"], res["fraud"], res["trust"], cfg_all(conn),
                                       amount=sim.amount, rate=sim.interest_rate, duration=sim.duration_months)
        pay = emi(sim.amount, sim.interest_rate, sim.duration_months)
        inc = b["avg_income_6m"] or 1
        conn.execute("INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)",
                     (sim.borrower_id, None, actor_of(authorization, x_api_key), "simulation",
                      json.dumps({"amount": sim.amount, "rate": sim.interest_rate, "duration": sim.duration_months,
                                  "decision": rec["decision"]}), now()))
        conn.commit()
        return {**rec, "monthly_payment": pay, "total_repayment": round(pay * sim.duration_months, 2),
                "base_risk": res["risk"]["risk_level"], "base_trust": res["trust"]["trust_score"]}
    finally:
        conn.close()


@router.get("/borrowers/{bid}/audit")
def get_audit(bid: str):
    conn = _DB()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM ls_audit WHERE borrower_id=? ORDER BY id DESC LIMIT 50", (bid,))]
    finally:
        conn.close()


# ---------------- documents ----------------

class DocIn(BaseModel):
    doc_type: str
    file_name: str
    status: str = "needs_review"
    quality_score: int = 70
    note: str = ""


@router.get("/borrowers/{bid}/documents")
def get_documents(bid: str):
    conn = _DB()
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM ls_documents WHERE borrower_id=?", (bid,))]
    finally:
        conn.close()


@router.post("/borrowers/{bid}/documents")
def add_document(bid: str, doc: DocIn, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "documents.write")
    if doc.status not in ("verified", "needs_review", "suspicious"):
        raise HTTPException(400, "Invalid status")
    if doc.doc_type not in ("identity", "bank_statement", "income_document", "salary_slip", "business_document"):
        raise HTTPException(400, "Unknown document type")
    if not doc.file_name.strip():
        raise HTTPException(400, "File name is required")
    if not (0 <= doc.quality_score <= 100):
        raise HTTPException(400, "Quality score must be 0-100")
    conn = _DB()
    try:
        if not conn.execute("SELECT 1 FROM ls_borrowers WHERE borrower_id=?", (bid,)).fetchone():
            raise HTTPException(404, "Borrower not found")
        cur = conn.cursor()
        cur.execute("INSERT INTO ls_documents (borrower_id, doc_type, file_name, status, quality_score, note, created_at)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (bid, doc.doc_type, doc.file_name, doc.status, doc.quality_score, doc.note, now()))
        did = cur.lastrowid
        cur.execute("INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)",
                    (bid, None, actor_of(authorization, x_api_key), "document_uploaded",
                     json.dumps({"doc_id": did, "type": doc.doc_type, "file": doc.file_name}), now()))
        conn.commit()
        return {"id": did, **doc.model_dump()}
    finally:
        conn.close()


class DocPatch(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = None


@router.patch("/documents/{doc_id}")
def patch_document(doc_id: int, patch: DocPatch, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "documents.write")
    if patch.status and patch.status not in ("verified", "needs_review", "suspicious"):
        raise HTTPException(400, "Invalid status")
    conn = _DB()
    try:
        d = conn.execute("SELECT * FROM ls_documents WHERE id=?", (doc_id,)).fetchone()
        if not d:
            raise HTTPException(404, "Document not found")
        d = dict(d)
        if patch.status:
            conn.execute("UPDATE ls_documents SET status=? WHERE id=?", (patch.status, doc_id))
        if patch.note is not None:
            conn.execute("UPDATE ls_documents SET note=? WHERE id=?", (patch.note, doc_id))
        conn.execute("INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)",
                     (d["borrower_id"], None, actor_of(authorization, x_api_key), "document_reviewed",
                      json.dumps({"doc_id": doc_id, "status": patch.status or d["status"]}), now()))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------------- admin ----------------

@router.get("/admin/stats")
def admin_stats():
    conn = _DB()
    try:
        nb = conn.execute("SELECT COUNT(*) c FROM ls_borrowers").fetchone()["c"]
        na = conn.execute("SELECT COUNT(*) c FROM ls_analyses").fetchone()["c"]
        avg_t = conn.execute("SELECT COALESCE(AVG(trust_score),0) v FROM ls_analyses a JOIN "
                             "(SELECT borrower_id, MAX(id) m FROM ls_analyses GROUP BY borrower_id) x "
                             "ON x.borrower_id=a.borrower_id AND x.m=a.id").fetchone()["v"]
        mix = {r["decision"]: r["c"] for r in conn.execute(
            "SELECT decision, COUNT(*) c FROM ls_analyses a JOIN "
            "(SELECT borrower_id, MAX(id) m FROM ls_analyses GROUP BY borrower_id) x "
            "ON x.borrower_id=a.borrower_id AND x.m=a.id GROUP BY decision")}
        return {"borrowers": nb, "analyses": na, "avg_trust": round(avg_t or 0, 1),
                "decision_mix": mix, "model_version": _active_model_version()}
    finally:
        conn.close()


@router.get("/admin/config")
def get_config():
    conn = _DB()
    try:
        return cfg_all(conn)
    finally:
        conn.close()


class ConfigIn(BaseModel):
    key: str
    value: Any


@router.put("/admin/config")
def put_config(item: ConfigIn, authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "policy.update")
    if item.key not in DEFAULT_CONFIG or item.key == "model_version":
        raise HTTPException(400, "Unknown or locked config key")
    conn = _DB()
    try:
        conn.execute("INSERT INTO ls_config (key, value, updated_at) VALUES (?,?,?) "
                     "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                     (item.key, json.dumps(item.value), now()))
        conn.execute("INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)",
                     ("*", None, actor_of(authorization, x_api_key), "config_changed",
                      json.dumps({"key": item.key, "value": item.value}), now()))
        conn.commit()
        return {"ok": True, "key": item.key, "value": item.value}
    finally:
        conn.close()


@router.get("/admin/model")
def admin_model():
    from . import ml as _ml
    m = _ml.metrics()
    m["loaded"] = _ml.loaded()
    m["artifact"] = "models/risk_model.joblib"
    return m


def _active_model_version() -> str:
    from . import ml as _ml
    from .schema import MODEL_VERSION as _rules
    try:
        return _ml.MODEL_ID if _ml.loaded() else _rules
    except Exception:
        return _rules


@router.get("/admin/audit")
def admin_audit(limit: int = 50):
    conn = _DB()
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM ls_audit ORDER BY id DESC LIMIT ?", (min(limit, 200),))]
    finally:
        conn.close()


# ---------------- admin: command center ----------------

REVIEW_DECISIONS = ("APPROVE", "APPROVE_WITH_CONDITIONS", "REDUCE_AMOUNT", "MANUAL_REVIEW", "REJECT")


def _ensure_review_cols(conn):
    for _col, _typ in (("review_decision", "TEXT"), ("review_note", "TEXT"),
                       ("reviewed_by", "TEXT"), ("reviewed_at", "TEXT")):
        try:
            conn.execute(f"ALTER TABLE ls_analyses ADD COLUMN {_col} {_typ}")
        except Exception:
            pass  # already exists


_LATEST_JOIN = ("ls_analyses a JOIN (SELECT borrower_id, MAX(id) m FROM ls_analyses "
                "GROUP BY borrower_id) x ON x.borrower_id=a.borrower_id AND x.m=a.id")


@router.get("/admin/overview")
def admin_overview():
    conn = _DB()
    try:
        _ensure_review_cols(conn)
        nb = conn.execute("SELECT COUNT(*) c FROM ls_borrowers").fetchone()["c"]
        na = conn.execute("SELECT COUNT(*) c FROM ls_analyses").fetchone()["c"]
        latest = conn.execute(
            f"SELECT a.* FROM {_LATEST_JOIN}").fetchall()
        latest = [dict(r) for r in latest]
        mix: dict[str, int] = {}
        trust_vals, conf_vals = [], []
        pending = reviewed = high_risk = high_fraud = 0
        for a in latest:
            d = a.get("decision") or "UNKNOWN"
            mix[d] = mix.get(d, 0) + 1
            if a.get("trust_score") is not None:
                trust_vals.append(a["trust_score"])
            if a.get("confidence") is not None:
                conf_vals.append(a["confidence"])
            if (a.get("risk_level") or "") == "HIGH":
                high_risk += 1
            if (a.get("fraud_risk") or "") == "HIGH":
                high_fraud += 1
            if a.get("review_decision"):
                reviewed += 1
            elif d == "MANUAL_REVIEW":
                pending += 1
        # 14-day analysis volume
        series = [{"day": r["day"], "count": r["c"]} for r in conn.execute(
            "SELECT substr(created_at,1,10) day, COUNT(*) c FROM ls_analyses "
            "WHERE created_at >= datetime('now','-14 days') GROUP BY day ORDER BY day")]
        # recent activity with borrower names
        recent = [dict(r) for r in conn.execute(
            "SELECT au.*, b.name borrower_name FROM ls_audit au "
            "LEFT JOIN ls_borrowers b ON b.borrower_id=au.borrower_id "
            "ORDER BY au.id DESC LIMIT 8")]
        nkeys = conn.execute("SELECT COUNT(*) c FROM ls_api_keys WHERE revoked=0").fetchone()["c"]
        return {
            "borrowers": nb, "analyses": na,
            "decision_mix": mix, "pending_review": pending, "reviewed": reviewed,
            "high_risk": high_risk, "high_fraud": high_fraud,
            "avg_trust": round(sum(trust_vals) / len(trust_vals), 1) if trust_vals else 0,
            "avg_confidence": round(sum(conf_vals) / len(conf_vals), 1) if conf_vals else 0,
            "series_14d": series, "recent_activity": recent,
            "active_api_keys": nkeys, "model_version": _active_model_version(),
        }
    finally:
        conn.close()


# ---------------- admin: approvals ----------------

@router.get("/admin/approvals")
def admin_approvals(decision: str = "all", q: str = "", page: int = 1, page_size: int = 12):
    page_size = max(1, min(page_size, 50))
    q = (q or "")[:80]
    conn = _DB()
    try:
        _ensure_review_cols(conn)
        rows = [dict(r) for r in conn.execute(
            "SELECT a.*, b.name borrower_name, b.city, b.requested_amount, b.monthly_income "
            "FROM ls_analyses a LEFT JOIN ls_borrowers b ON b.borrower_id=a.borrower_id "
            "ORDER BY a.id DESC")]
        ql = (q or "").strip().lower()
        out = []
        for a in rows:
            if ql and ql not in f"{a.get('borrower_id','')} {a.get('borrower_name') or ''}".lower():
                continue
            rev = a.get("review_decision")
            if decision == "pending":
                if rev or a.get("decision") != "MANUAL_REVIEW":
                    continue
            elif decision == "reviewed":
                if not rev:
                    continue
            elif decision != "all" and a.get("decision") != decision:
                continue
            out.append({k: a.get(k) for k in (
                "id", "borrower_id", "borrower_name", "city", "requested_amount", "monthly_income",
                "model_version", "risk_score", "risk_level", "fraud_score", "fraud_risk",
                "trust_score", "confidence", "decision", "recommended_amount", "interest_rate",
                "duration_months", "monthly_payment", "created_at", "created_by",
                "review_decision", "review_note", "reviewed_by", "reviewed_at")})
        total = len(out)
        page = max(1, page)
        return {"total": total, "page": page, "page_size": page_size,
                "rows": out[(page - 1) * page_size: page * page_size]}
    finally:
        conn.close()


class ReviewIn(BaseModel):
    decision: str
    note: str = ""


@router.post("/admin/approvals/{aid}/review")
def review_approval(aid: int, item: ReviewIn,
                    authorization: str | None = Header(default=None),
                    x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "review.decide")
    if item.decision not in REVIEW_DECISIONS:
        raise HTTPException(400, f"Decision must be one of {', '.join(REVIEW_DECISIONS)}")
    if item.decision == "REJECT" and len((item.note or "").strip()) < 5:
        raise HTTPException(400, "A reason (min 5 characters) is required to reject")
    conn = _DB()
    try:
        _ensure_review_cols(conn)
        a = conn.execute("SELECT * FROM ls_analyses WHERE id=?", (aid,)).fetchone()
        if not a:
            raise HTTPException(404, "Analysis not found")
        a = dict(a)
        actor = actor_of(authorization, x_api_key)
        ts = now()
        conn.execute("UPDATE ls_analyses SET review_decision=?, review_note=?, reviewed_by=?, reviewed_at=? WHERE id=?",
                     (item.decision, (item.note or "").strip(), actor, ts, aid))
        conn.execute("INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)",
                     (a["borrower_id"], aid, actor, "review_decision",
                      json.dumps({"from": a["decision"], "to": item.decision,
                                  "note": (item.note or "").strip()}), ts))
        conn.commit()
        return {"ok": True, "analysis_id": aid, "from": a["decision"], "to": item.decision}
    finally:
        conn.close()


# ---------------- admin: sessions ----------------

@router.get("/admin/sessions")
def admin_sessions():
    # sessions table lives in the app DB, not the lendsure module DB handle —
    # both point at the same file, so query through this connection.
    conn = _DB()
    try:
        try:
            rows = conn.execute(
                "SELECT token, phone, display_name, role, created_at, expires_at FROM sessions ORDER BY created_at DESC LIMIT 100").fetchall()
        except Exception:
            return []
        return [{"token_prefix": r["token"][:8] + "…", "token": r["token"],
                 "phone": r["phone"], "display_name": r["display_name"], "role": r["role"],
                 "created_at": r["created_at"], "expires_at": r["expires_at"],
                 "expired": r["expires_at"] < now()} for r in rows]
    finally:
        conn.close()


@router.delete("/admin/sessions/{token}")
def revoke_session(token: str, authorization: str | None = Header(default=None),
                   x_api_key: str | None = Header(default=None)):
    require_perm(authorization, x_api_key, "sessions.revoke")
    conn = _DB()
    try:
        cur = conn.cursor()
        row = cur.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")
        cur.execute("DELETE FROM sessions WHERE token=?", (token,))
        cur.execute("INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)",
                    ("*", None, actor_of(authorization, x_api_key), "session_revoked",
                     json.dumps({"phone": row["phone"], "display_name": row["display_name"]}), now()))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------------- admin: feature registry + model registry ----------------

def _ensure_registry(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS ls_model_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL,
        metrics_json TEXT DEFAULT '{}', approved_by TEXT DEFAULT '',
        created_at TEXT NOT NULL, deployed_at TEXT)""")
    if conn.execute("SELECT COUNT(*) c FROM ls_model_registry").fetchone()["c"] == 0:
        from . import ml as _ml
        m = _ml.metrics()
        conn.execute("INSERT INTO ls_model_registry (name, version, status, metrics_json, approved_by, created_at, deployed_at)"
                     " VALUES (?,?,?,?,?,?,?)",
                     ("repayment-risk", m.get("model_id", "unknown"), "DEPLOYED",
                      json.dumps({k: m.get(k) for k in
                                  ("test_auc", "test_ap", "test_accuracy", "test_precision", "test_recall",
                                   "label_rate", "brier_score", "cv_auc_mean")}),
                      "training-pipeline", m.get("trained_at", now()), m.get("trained_at", now())))
        conn.commit()


@router.get("/admin/features")
def admin_features():
    from .feature_dict import ENGINEERED_DICT, FEATURES, GROUPS
    return {"groups": GROUPS, "features": FEATURES, "engineered": ENGINEERED_DICT,
            "count_raw": len(FEATURES), "count_engineered": len(ENGINEERED_DICT)}


@router.get("/admin/registry")
def admin_registry():
    conn = _DB()
    try:
        _ensure_registry(conn)
        return [dict(r) for r in conn.execute("SELECT * FROM ls_model_registry ORDER BY id DESC")]
    finally:
        conn.close()
