"""LendSure Intelligence Copilot — deterministic analyst, not an LLM.

Answers borrower/lender questions by calling the same backend services the
UI uses, then composing cited answers from real rows. It cannot approve,
reject, mutate, or bypass authorization: it only reads through the caller's
permissions. Every number in an answer traces to a cited record.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/ls", tags=["copilot"])

_DB = None
_RESOLVE = lambda auth: None  # noqa: E731


def configure(db_factory, session_resolver):
    global _DB, _RESOLVE
    _DB = db_factory
    _RESOLVE = session_resolver


def _need(authorization: Optional[str], x_api_key: Optional[str] = None, *perms: str) -> str:
    from .api import require_perm
    return require_perm(authorization, x_api_key, *perms)


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


def _latest_analysis(conn, bid: str):
    return conn.execute(
        "SELECT * FROM ls_analyses WHERE borrower_id=? ORDER BY id DESC LIMIT 1",
        (bid,)).fetchone()


def _borrower(conn, bid: str):
    return conn.execute("SELECT borrower_id, name, city FROM ls_borrowers WHERE borrower_id=?",
                        (bid,)).fetchone()


def _find_bid(conn, q: str) -> Optional[str]:
    m = re.search(r"\b([A-Za-z]{1,4}-?\d{3,6})\b", q.upper())
    if m:
        cand = m.group(1).upper()
        for fmt in (cand, cand.replace("-", "")):
            r = conn.execute("SELECT borrower_id FROM ls_borrowers WHERE borrower_id=?",
                             (fmt,)).fetchone()
            if r:
                return r["borrower_id"]
    return None


def answer(conn, q: str) -> dict:
    tools, cites = [], []

    def cite(label: str, link: str):
        cites.append({"label": label, "link": link})

    # — risk why —
    m = re.search(r"why.*\b(high risk|risky|risk)\b", q)
    bid = _find_bid(conn, q)
    if (m or "why" in q) and bid:
        tools.append("risk_analysis.read")
        a = _latest_analysis(conn, bid)
        b = _borrower(conn, bid)
        if not a:
            return {"answer": f"No recorded risk analysis for {bid}. Run an analysis first.",
                    "tools_used": tools, "citations": [], "borrower_id": bid}
        a = dict(a)
        try:
            factors = json.loads(a.get("risk_factors") or "[]")
        except Exception:
            factors = []
        up = sorted([f for f in factors if (f.get("impact") == "raises")],
                    key=lambda f: -(f.get("weight", 0) * f.get("score", 0)))[:3]
        lines = [f"• {f.get('title')}: {f.get('observed')}" for f in up]
        cite(f"Borrower {bid} analysis #{a['id']}", f"/borrower/{bid}")
        return {
            "answer": (f"{b['name']} ({bid}) carries a {a['risk_level']} repayment-risk estimate "
                       f"(score {a['risk_score']}/100, model {a['model_version']}, confidence {a['confidence']}%). "
                       f"Top contributing factors: " + ("; ".join(lines) if lines else "no dominant raisers recorded.")),
            "tools_used": tools, "citations": cites, "borrower_id": bid}

    # — rate / recommendation why —
    if re.search(r"rate|interest|recommend", q):
        tools.append("recommendation.read")
        if bid:
            a = _latest_analysis(conn, bid)
            if a:
                rec = conn.execute("SELECT * FROM ls_recommendations WHERE analysis_id=?",
                                   (a["id"],)).fetchone()
                if rec:
                    rec = dict(rec)
                    cfg = conn.execute("SELECT value FROM ls_config WHERE key='interest_low'").fetchone()
                    cite(f"Recommendation for {bid}", f"/borrower/{bid}")
                    return {
                        "answer": (f"Recommended {rec['decision']}: ₹{rec['recommended_amount']:,.0f} at "
                                   f"{rec['interest_rate']}% × {rec['duration_months']}m (EMI ₹{rec['monthly_payment']:,.0f}). "
                                   f"Rationale: {rec['rationale']} Bands come from the active risk policy; "
                                   f"the rate band follows the borrower's risk level."),
                        "tools_used": tools, "citations": cites, "borrower_id": bid}
        return {"answer": "Give me a borrower ID (e.g. B10001) and I'll explain its rate and recommendation from the recorded analysis.",
                "tools_used": tools, "citations": cites, "borrower_id": None}

    # — what changed —
    if "chang" in q:
        tools.append("risk_history.read")
        if not bid:
            return {"answer": "Tell me which borrower (e.g. 'what changed for B10001?') and I'll diff its last two recorded analyses.",
                    "tools_used": tools, "citations": cites, "borrower_id": None}
        rows = conn.execute(
            "SELECT id, risk_score, risk_level, trust_score, decision, risk_factors, created_at"
            " FROM ls_analyses WHERE borrower_id=? ORDER BY id", (bid,)).fetchall()
        if len(rows) < 2:
            return {"answer": f"{bid} has only {len(rows)} recorded analysis — nothing to diff yet.",
                    "tools_used": tools, "citations": cites, "borrower_id": bid}
        a, b = dict(rows[-2]), dict(rows[-1])
        cite(f"{bid} history", f"/borrower/{bid}")
        return {
            "answer": (f"{bid}: risk estimate {a['risk_score']} → {b['risk_score']} "
                       f"({a['risk_level']} → {b['risk_level']}), trust {a['trust_score']} → {b['trust_score']}, "
                       f"decision {a.get('decision')} → {b.get('decision')} "
                       f"(analyses #{a['id']} → #{b['id']}). Factor-level moves are in the risk-history record."),
            "tools_used": tools, "citations": cites, "borrower_id": bid}

    # — risk increased X% —
    m = re.search(r"risk (increased|rose|up).*?(\d+)", q)
    if m or ("increased" in q and "risk" in q):
        tools.append("early_warnings.read")
        thresh = int(m.group(2)) if m else 15
        seq: dict[str, list] = {}
        for r in conn.execute(
                "SELECT a.borrower_id, b.name, a.risk_score, a.id FROM ls_analyses a "
                "JOIN ls_borrowers b ON b.borrower_id=a.borrower_id "
                "WHERE a.risk_score IS NOT NULL ORDER BY a.borrower_id, a.id").fetchall():
            seq.setdefault(r["borrower_id"], []).append(dict(r))
        hits = []
        for _bid, rows in seq.items():
            if len(rows) >= 2 and (rows[-1]["risk_score"] or 0) - (rows[-2]["risk_score"] or 0) >= thresh:
                hits.append((_bid, rows[-1]["name"], rows[-2]["risk_score"], rows[-1]["risk_score"]))
        for _bid, _n, _o, _nw in hits[:8]:
            cite(f"{_bid} ({_o} → {_nw})", f"/borrower/{_bid}")
        return {"answer": (f"{len(hits)} borrower(s) show a risk rise ≥ {thresh} pts between their last two recorded analyses."
                           if hits else f"No borrower shows a recorded risk rise ≥ {thresh} pts."),
                "tools_used": tools, "citations": cites, "borrower_id": None}

    # — networks —
    if re.search(r"network|suspicious|cluster|fraud.*around|around.*fraud", q):
        tools.append("graph.read")
        if bid:
            # compute directly from stored identifiers (no fake numbers)
            shared = []
            b = conn.execute("SELECT phone, email, address_line, device_id, bank_account FROM ls_borrowers WHERE borrower_id=?",
                             (bid,)).fetchone()
            if b:
                for field in ("phone", "email", "address_line", "device_id", "bank_account"):
                    v = (dict(b).get(field) or "").strip()
                    if not v:
                        continue
                    c = conn.execute(
                        f"SELECT COUNT(*) n FROM ls_borrowers WHERE {field}=? AND borrower_id!=?",
                        (v, bid)).fetchone()["n"]
                    if c:
                        shared.append(f"{field} shared with {c} other(s)")
            cite(f"{bid} network", f"/borrower/{bid}?tab=network")
            others = conn.execute(
                "SELECT COUNT(*) c FROM (SELECT borrower_id FROM ls_borrowers WHERE "
                "(phone!='' OR email!='' OR address_line!='' OR device_id!='' OR bank_account!='')"
                " GROUP BY borrower_id)").fetchone()["c"]
            return {"answer": ((f"{bid}: " + ("; ".join(shared) + ". " if shared else "no shared identifiers on file. ")
                                + "Shared identifiers mean network exposure, not fraud.")
                               + f" {others} borrower(s) portfolio-wide have identifiers on file."),
                    "tools_used": tools, "citations": cites, "borrower_id": bid}
        return {"answer": "Name a borrower (e.g. 'find suspicious networks around B10003') and I'll trace its real shared-identifier links.",
                "tools_used": tools, "citations": cites, "borrower_id": None}

    # — loans needing attention —
    if re.search(r"attention|due|missed|today|action|pending", q):
        tools.append("loans.read")
        miss = conn.execute(
            "SELECT COUNT(*) c FROM ls_schedule s JOIN ls_loans l ON l.id=s.loan_id "
            "WHERE s.status IN ('MISSED','LATE') AND l.borrower_id NOT LIKE 'SIM-%'").fetchone()["c"]
        pend = conn.execute(
            "SELECT COUNT(*) c FROM ls_loan_requests WHERE status IN ('SUBMITTED','UNDER_REVIEW')").fetchone()["c"]
        cite("Loans", "/loans")
        cite("Loan requests", "/loan-requests")
        return {"answer": f"{miss} installment(s) currently MISSED/LATE and {pend} request(s) awaiting review.",
                "tools_used": tools, "citations": cites, "borrower_id": None}

    # — portfolio —
    if re.search(r"portfolio|exposure|health|overview", q):
        tools.append("portfolio.read")
        l = conn.execute(
            "SELECT COUNT(*) n, COALESCE(SUM(outstanding_principal),0) o FROM ls_loans "
            "WHERE borrower_id NOT LIKE 'SIM-%'").fetchone()
        cite("Loans", "/loans")
        return {"answer": f"Portfolio: {l['n']} loan(s), ₹{l['o']:,.0f} outstanding principal (SIMULATION rows excluded).",
                "tools_used": tools, "citations": cites, "borrower_id": None}

    return {"answer": ("I answer from live LendSure records. Try: 'Why is B10001 high risk?', "
                       "'Why was this loan recommended at 8.8%?', 'What changed for B10003?', "
                       "'Show borrowers whose risk increased more than 15%', "
                       "'Find suspicious networks around B10003', or 'Which loans need attention today?'"),
            "tools_used": [], "citations": [], "borrower_id": None}


@router.post("/copilot/ask")
def ask(body: AskIn, authorization: Optional[str] = Header(default=None),
        x_api_key: Optional[str] = Header(default=None)):
    _need(authorization, x_api_key, "analysis.read")
    conn = _DB()
    try:
        out = answer(conn, body.question.strip().lower())
        out["engine"] = "deterministic analyst (no LLM; reads authorized backend records only)"
        return out
    finally:
        conn.close()
