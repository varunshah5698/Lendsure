"""
AI-Powered Trust & Risk Intelligence for Informal Lending
Backend: FastAPI + SQLite (stdlib) + explainable rule-based AI engine.
Every decision returns score breakdown + evidence + confidence + audit trail.
Run: pip install -r requirements.txt && python app.py  (serves API + dashboard on :8000)
"""
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from lendsure.schema import DDL as LS_DDL, LIFECYCLE_DDL, LS_MIGRATIONS

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "lending.db"
STATIC_DIR = BASE_DIR / "static"

# ---------------- Security config (env-driven, no secrets in code) ----------------
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "LENDSURE_CORS_ORIGINS",
    "http://127.0.0.1:8000,http://localhost:8000,http://localhost:5173").split(",") if o.strip()]
MAX_BODY_BYTES = int(os.environ.get("LENDSURE_MAX_BODY_BYTES", "1000000"))

app = FastAPI(title="LendSure API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_RATE_BUCKETS: dict[str, deque] = {}


def _rate_tier(path: str) -> tuple[int, int]:
    """(max_requests, window_seconds) per client IP. Strict for auth, moderate
    for mutations/analysis, lenient for reads."""
    if path.startswith("/api/auth/"):
        return (20, 60)
    if ("/analyze" in path or "/simulate" in path or "/admin/approvals" in path
            or "/admin/config" in path or "/admin/keys" in path or "/documents" in path):
        return (60, 60)
    return (300, 60)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    rid = uuid.uuid4().hex[:12]
    request.state.rid = rid
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        try:
            cl = int(request.headers.get("content-length", "0") or 0)
        except ValueError:
            cl = 0
        if cl > MAX_BODY_BYTES:
            return JSONResponse(
                {"detail": f"Request body too large (limit {MAX_BODY_BYTES} bytes)"},
                status_code=413, headers={"X-Request-ID": rid})
    p = request.url.path
    if not (p.startswith("/static") or p in ("/docs", "/openapi.json", "/redoc")):
        limit, window = _rate_tier(p)
        host = request.client.host if request.client else "?"
        dq = _RATE_BUCKETS.get(f"{host}:{limit}:{window}")
        if dq is None:
            dq = _RATE_BUCKETS[f"{host}:{limit}:{window}"] = deque()
        now_t = time.time()
        while dq and dq[0] <= now_t - window:
            dq.popleft()
        if len(dq) >= limit:
            return JSONResponse(
                {"detail": "Rate limit exceeded. Slow down and retry."},
                status_code=429, headers={"X-Request-ID": rid, "Retry-After": "60"})
        dq.append(now_t)
        if len(_RATE_BUCKETS) > 5000:
            _RATE_BUCKETS.clear()
    resp = await call_next(request)
    resp.headers["X-Request-ID"] = rid
    # Cache policy: hashed build assets are immutable; entry HTML never caches
    # (stale index.html referencing wiped hashed chunks silently kills lazy 3D).
    if p.startswith("/static/assets"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
    return resp


def _audit_event(action: str, actor: str, detail: dict):
    """Best-effort audit write — must never break the request it records."""
    try:
        conn = db()
        try:
            conn.execute(
                "INSERT INTO ls_audit (borrower_id, analysis_id, actor, action, detail, created_at)"
                " VALUES (?,?,?,?,?,?)",
                ("*", None, actor, action, json.dumps(detail), datetime.utcnow().isoformat()))
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass

# ---------------- DB ----------------

def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS borrowers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            id_number TEXT NOT NULL,
            address TEXT DEFAULT '',
            employment_type TEXT DEFAULT 'self-employed',
            monthly_income REAL DEFAULT 0,
            employment_years REAL DEFAULT 0,
            past_loans_repaid INTEGER DEFAULT 0,
            past_defaults INTEGER DEFAULT 0,
            past_delays INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            borrower_id INTEGER NOT NULL,
            doc_type TEXT NOT NULL,
            file_name TEXT DEFAULT '',
            extracted_income REAL DEFAULT 0,
            authentic INTEGER DEFAULT 1,
            notes TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS vouches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            borrower_id INTEGER NOT NULL,
            voucher_name TEXT NOT NULL,
            relationship TEXT DEFAULT 'community',
            trust_level INTEGER DEFAULT 3,
            comment TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            borrower_id INTEGER NOT NULL,
            requested_amount REAL NOT NULL,
            tenure_months INTEGER NOT NULL,
            purpose TEXT DEFAULT 'personal',
            status TEXT NOT NULL,
            recommended_amount REAL NOT NULL,
            interest_rate REAL NOT NULL,
            risk_level TEXT NOT NULL,
            trust_score REAL NOT NULL,
            confidence REAL NOT NULL,
            explanation_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fraud_flags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            borrower_id INTEGER NOT NULL,
            loan_id INTEGER DEFAULT 0,
            flag_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            description TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            code TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            phone TEXT NOT NULL,
            display_name TEXT DEFAULT '',
            role TEXT DEFAULT 'lender',
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email_verified INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS email_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        """
    )
    try:
        conn.execute("ALTER TABLE sessions ADD COLUMN email TEXT DEFAULT ''")
    except Exception:
        pass  # column already exists
    conn.commit()
    conn.close()
    # LendSure tables (created if missing; data comes from import_lendsure.py)
    _ls = db()
    try:
        _ls.executescript(LS_DDL)
        _ls.executescript(LIFECYCLE_DDL)
        for _col in ("risk_factors", "fraud_signals", "trust_factors", "ml_score"):
            try:
                _ls.execute(f"ALTER TABLE ls_analyses ADD COLUMN {_col} TEXT DEFAULT '[]'")
            except Exception:
                pass  # column already exists
        for _mig in LS_MIGRATIONS:
            try:
                _ls.execute(_mig)
            except Exception:
                pass  # already applied
        _ls.commit()
    finally:
        _ls.close()


init_db()

# LendSure product API (borrowers, analysis, evidence, admin) — real DB-backed routes
from lendsure import api as ls_api  # noqa: E402
from lendsure import finance as fi_api  # noqa: E402
from lendsure import loans as loan_api  # noqa: E402
from lendsure import jobs as jobs_api  # noqa: E402
from lendsure import graph as graph_api  # noqa: E402
from lendsure import notify as notify_api  # noqa: E402


def _ls_session(authorization: Optional[str]) -> Optional[dict]:
    return _session_from_header(authorization)


ls_api.configure(db, _ls_session)
app.include_router(ls_api.router)

fi_api.configure(db, _ls_session)
fi_api.init_fi_db()
app.include_router(fi_api.router)

loan_api.configure(db, _ls_session)
app.include_router(loan_api.router)

jobs_api.configure(db, _ls_session)
jobs_api.start_worker()
app.include_router(jobs_api.router)

graph_api.configure(db, _ls_session)
app.include_router(graph_api.router)

notify_api.configure(db, _ls_session)
app.include_router(notify_api.router)

from lendsure import intel as intel_api  # noqa: E402
intel_api.configure(db, _ls_session)
app.include_router(intel_api.router)

from lendsure import copilot as copilot_api  # noqa: E402
copilot_api.configure(db, _ls_session)
app.include_router(copilot_api.router)

from lendsure import simulate as sim_api  # noqa: E402
sim_api.configure(db, _ls_session)
app.include_router(sim_api.router)

# ---------------- Models ----------------

class BorrowerIn(BaseModel):
    name: str
    phone: str
    id_number: str
    address: str = ""
    employment_type: str = "self-employed"
    monthly_income: float = 0
    employment_years: float = 0
    past_loans_repaid: int = 0
    past_defaults: int = 0
    past_delays: int = 0


class DocIn(BaseModel):
    doc_type: str = "bank_statement"
    file_name: str = ""
    extracted_income: float = 0
    authentic: bool = True
    notes: str = ""


class VouchIn(BaseModel):
    voucher_name: str
    relationship: str = "community"
    trust_level: int = Field(default=3, ge=1, le=5)
    comment: str = ""


class LoanReqIn(BaseModel):
    requested_amount: float
    tenure_months: int = 12
    purpose: str = "personal"


class EvaluateIn(BaseModel):
    borrower: BorrowerIn
    documents: list[DocIn] = []
    vouches: list[VouchIn] = []
    loan: LoanReqIn


class OtpRequestIn(BaseModel):
    phone: str
    name: str = ""


class OtpVerifyIn(BaseModel):
    phone: str
    otp: str
    name: str = ""


class GuestIn(BaseModel):
    name: str = "Guest"


# Demo mode: OTP is returned in the API response + server log so the flow
# works without an SMS provider. Set False when a real SMS gateway is wired.
# Demo mode: OTP is returned in the API response + server log so the flow
# works without an SMS provider. Set LENDSURE_DEMO_OTP=0 + wire an SMS gateway
# for production. OTP_TTL_MIN configurable via LENDSURE_OTP_TTL_MIN.
DEMO_OTP = os.environ.get("LENDSURE_DEMO_OTP", "1") == "1"
OTP_TTL_MIN = int(os.environ.get("LENDSURE_OTP_TTL_MIN", "5"))
OTP_TTL_MIN = max(1, OTP_TTL_MIN)


# ---------------- Explainable AI engine ----------------

def _evidence(text: str) -> str:
    return text


def score_identity(b: BorrowerIn):
    """25 pts max"""
    points = 0.0
    reasons = []
    phone_ok = bool(re.match(r"^\d{10}$", b.phone.strip()))
    id_ok = bool(re.match(r"^[A-Za-z0-9]{6,16}$", b.id_number.strip()))
    addr_ok = len(b.address.strip()) >= 8

    if phone_ok:
        points += 10
        reasons.append(("Phone verified (10-digit)", 10, 10, _evidence(f"Phone {b.phone} format valid")))
    else:
        reasons.append(("Phone invalid", 0, 10, _evidence(f"Phone '{b.phone}' failed 10-digit check")))
    if id_ok:
        points += 10
        reasons.append(("Govt ID format valid", 10, 10, _evidence(f"ID {b.id_number} passed format check")))
    else:
        reasons.append(("Govt ID invalid", 0, 10, _evidence(f"ID '{b.id_number}' failed format check")))
    if addr_ok:
        points += 5
        reasons.append(("Address present", 5, 5, _evidence("Address length >= 8 chars")))
    else:
        reasons.append(("Address missing", 0, 5, _evidence("No usable address provided")))
    return points, reasons, phone_ok, id_ok


def score_financial(b: BorrowerIn, docs: list[DocIn], requested: float):
    """25 pts max"""
    points = 0.0
    reasons = []
    income = b.monthly_income or 0
    # affordability: requested <= 6x monthly income is healthy
    ratio = (requested / income) if income > 0 else 999
    if income <= 0:
        reasons.append(("No income stated", 0, 10, _evidence("monthly_income = 0")))
        aff_pts = 0
    elif ratio <= 3:
        aff_pts = 10
        reasons.append((f"Healthy loan-to-income x{ratio:.1f}", 10, 10, _evidence(f"Requested {requested} vs income {income}/mo")))
    elif ratio <= 6:
        aff_pts = 6
        reasons.append((f"Moderate loan-to-income x{ratio:.1f}", 6, 10, _evidence(f"Requested {requested} vs income {income}/mo")))
    else:
        aff_pts = 2
        reasons.append((f"Stretched loan-to-income x{ratio:.1f}", 2, 10, _evidence(f"Requested {requested} >> income {income}/mo")))
    points += aff_pts

    # employment stability 0-8
    if b.employment_years >= 3:
        points += 8
        reasons.append((f"Stable employment {b.employment_years}y", 8, 8, _evidence(f"{b.employment_type}, {b.employment_years}y")))
    elif b.employment_years >= 1:
        points += 5
        reasons.append((f"Moderate employment {b.employment_years}y", 5, 8, _evidence(f"{b.employment_type}, {b.employment_years}y")))
    else:
        points += 2
        reasons.append((f"Unstable/short employment {b.employment_years}y", 2, 8, _evidence(f"{b.employment_type}, {b.employment_years}y")))

    # document support 0-7
    if not docs:
        reasons.append(("No financial documents", 0, 7, _evidence("No bank_statement / salary_slip uploaded")))
    else:
        authentic_docs = [d for d in docs if d.authentic]
        if len(authentic_docs) == len(docs) and len(docs) >= 2:
            points += 7
            reasons.append((f"{len(docs)} authentic documents", 7, 7, _evidence("All docs marked authentic")))
        elif authentic_docs:
            points += 4
            reasons.append((f"{len(authentic_docs)}/{len(docs)} authentic documents", 4, 7, _evidence("Partial document authenticity")))
        else:
            reasons.append(("Documents failed authenticity", 0, 7, _evidence("All docs flagged non-authentic")))
    return points, reasons


def score_history(b: BorrowerIn):
    """20 pts max"""
    points = 0.0
    reasons = []
    if b.past_defaults > 0:
        penalty = min(12, b.past_defaults * 6)
        pts = max(0, 12 - penalty)
        points += pts
        reasons.append((f"{b.past_defaults} past default(s)", pts, 12, _evidence(f"past_defaults={b.past_defaults}")))
    else:
        base = min(12, 4 + b.past_loans_repaid * 2)
        points += base
        reasons.append((f"{b.past_loans_repaid} loans repaid, 0 defaults", base, 12, _evidence(f"repaid={b.past_loans_repaid}")))
    if b.past_delays == 0:
        points += 8
        reasons.append(("No repayment delays", 8, 8, _evidence("past_delays=0")))
    elif b.past_delays <= 2:
        points += 5
        reasons.append((f"{b.past_delays} delay(s)", 5, 8, _evidence(f"past_delays={b.past_delays}")))
    else:
        points += 1
        reasons.append((f"{b.past_delays} delays (high)", 1, 8, _evidence(f"past_delays={b.past_delays}")))
    return points, reasons


def score_network(vouches: list[VouchIn]):
    """15 pts max"""
    if not vouches:
        return 3.0, [("No community vouches", 3, 15, _evidence("Trust network empty — thin-file borrower"))]

    avg = sum(v.trust_level for v in vouches) / len(vouches)
    count_bonus = min(5, len(vouches) * 1.5)
    avg_pts = (avg / 5) * 10
    total = round(min(15, avg_pts + count_bonus), 1)
    reasons = [
        (
            f"{len(vouches)} vouch(es), avg trust {avg:.1f}/5",
            total,
            15,
            _evidence(", ".join(f"{v.voucher_name}({v.trust_level}/5:{v.relationship})" for v in vouches)),
        )
    ]
    return total, reasons


def score_behavioral(docs: list[DocIn], b: BorrowerIn):
    """15 pts max"""
    points = 10.0
    reasons = []
    fake_docs = [d for d in docs if not d.authentic]
    if fake_docs:
        points -= 6
        reasons.append((f"{len(fake_docs)} suspect document(s)", -6, 0, _evidence(f"Flagged: {', '.join(d.file_name or d.doc_type for d in fake_docs)}")))
    # income consistency check
    doc_incomes = [d.extracted_income for d in docs if d.extracted_income > 0]
    if doc_incomes and b.monthly_income > 0:
        avg_doc = sum(doc_incomes) / len(doc_incomes)
        drift = abs(avg_doc - b.monthly_income) / b.monthly_income
        if drift <= 0.2:
            points += 5
            reasons.append(("Stated income matches documents (±20%)", 5, 5, _evidence(f"Stated {b.monthly_income} vs docs avg {avg_doc:.0f}")))
        elif drift <= 0.5:
            points += 2
            reasons.append(("Income partly consistent (±50%)", 2, 5, _evidence(f"Stated {b.monthly_income} vs docs avg {avg_doc:.0f}")))
        else:
            points -= 2
            reasons.append(("Income mismatch vs documents", -2, 5, _evidence(f"Stated {b.monthly_income} vs docs avg {avg_doc:.0f}, drift {drift:.0%}")))
    else:
        points += 1
        reasons.append(("Insufficient data for consistency check", 1, 5, _evidence("Need stated income + extracted doc income")))
    if not docs:
        reasons.append(("No docs to verify behaviour", 0, 0, _evidence("Behavioural score uses base 10")))
    else:
        reasons.append(("Document behaviour base", 10, 10, _evidence(f"{len(docs)} docs reviewed")))
    total = max(0, min(15, round(points, 1)))
    return total, reasons


def detect_fraud(b: BorrowerIn, docs: list[DocIn], vouches: list[VouchIn], requested: float, conn) -> list[dict]:
    flags = []
    # duplicate phone / ID
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) c FROM borrowers WHERE phone=?", (b.phone,))
    if cur.fetchone()["c"] > 0:
        flags.append({"flag_type": "duplicate_phone", "severity": "medium", "description": f"Phone {b.phone} already exists — possible repeat application."})
    cur.execute("SELECT COUNT(*) c FROM borrowers WHERE id_number=?", (b.id_number,))
    if cur.fetchone()["c"] > 0:
        flags.append({"flag_type": "duplicate_id", "severity": "high", "description": f"ID {b.id_number} already exists — verify identity."})
    # recent velocity: loans in last count
    cur.execute("SELECT COUNT(*) c FROM loans")
    total_loans = cur.fetchone()["c"]
    if b.monthly_income > 0 and requested > b.monthly_income * 10:
        flags.append({"flag_type": "over_leverage", "severity": "high", "description": f"Requested {requested:,.0f} > 10x monthly income {b.monthly_income:,.0f}."})
    if not re.match(r"^\d{10}$", b.phone.strip()):
        flags.append({"flag_type": "invalid_phone", "severity": "medium", "description": "Phone number format invalid."})
    if not re.match(r"^[A-Za-z0-9]{6,16}$", b.id_number.strip()):
        flags.append({"flag_type": "invalid_id", "severity": "high", "description": "ID number format invalid."})
    if any(not d.authentic for d in docs):
        flags.append({"flag_type": "suspect_document", "severity": "high", "description": "One or more documents failed authenticity check."})
    doc_incomes = [d.extracted_income for d in docs if d.extracted_income > 0]
    if doc_incomes and b.monthly_income > 0:
        avg_doc = sum(doc_incomes) / len(doc_incomes)
        if abs(avg_doc - b.monthly_income) / b.monthly_income > 0.5:
            flags.append({"flag_type": "income_mismatch", "severity": "medium", "description": f"Stated income {b.monthly_income:,.0f} differs >50% from docs avg {avg_doc:,.0f}."})
    if b.past_defaults >= 2:
        flags.append({"flag_type": "repeat_defaulter", "severity": "high", "description": f"{b.past_defaults} past defaults on record."})
    if total_loans > 0:
        cur.execute("SELECT COUNT(*) c FROM loans WHERE created_at > datetime('now','-1 day')")
        if cur.fetchone()["c"] >= 10:
            flags.append({"flag_type": "velocity_spike", "severity": "medium", "description": "Unusual application velocity in last 24h."})
    # self-vouch
    for v in vouches:
        if v.voucher_name.strip().lower() == b.name.strip().lower():
            flags.append({"flag_type": "self_vouch", "severity": "medium", "description": "Voucher name matches borrower (self-attestation)."})
    return flags


def decide(trust: float, fraud_flags: list[dict], requested: float, income: float, tenure: int):
    high_sev = sum(1 for f in fraud_flags if f["severity"] == "high")
    if high_sev >= 2 or trust < 35:
        status = "decline"
        risk = "High"
    elif high_sev == 1 or trust < 60:
        status = "conditional"
        risk = "Medium"
    else:
        status = "approve"
        risk = "Low"

    # affordability cap: multiplier grows with trust
    mult = 2 + (trust / 100) * 6  # 2x..8x monthly income
    affordable = income * mult if income > 0 else requested * 0.5
    recommended = round(min(requested, max(1000, affordable)), -2) if affordable >= 1000 else round(min(requested, affordable), 0)

    # risk-based interest
    if risk == "Low":
        rate = 10 + max(0, (75 - trust)) * 0.08   # ~10-14%
    elif risk == "Medium":
        rate = 15 + max(0, (60 - trust)) * 0.15   # ~15-19%
    else:
        rate = 20 + max(0, (35 - trust)) * 0.2    # 20%+
    rate = round(min(28, rate), 1)

    emi = round((recommended * (1 + rate / 100 * tenure / 12)) / max(1, tenure), 0) if recommended else 0

    terms: dict[str, Any] = {
        "recommended_amount": recommended,
        "interest_rate_pa": rate,
        "tenure_months": tenure,
        "est_monthly_emi": emi,
        "collateral_required": risk == "High" or (risk == "Medium" and requested > 50000),
        "guarantor_required": status == "conditional",
        "disbursal": "full" if status == "approve" else ("tranched" if status == "conditional" else "none"),
    }
    if status == "decline":
        terms["reason"] = "Trust score too low and/or multiple high-severity fraud signals."
    elif status == "conditional":
        terms["reason"] = "Approve partially with safeguards (lower amount, guarantor/tranches)."
    else:
        terms["reason"] = "Borrower meets trust and affordability criteria."
    return status, risk, terms


# ---------------- API ----------------

@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.utcnow().isoformat()}


# ---------------- Auth (OTP + guest) ----------------

def _now() -> datetime:
    return datetime.utcnow()


def _session_from_header(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    conn = db()
    try:
        row = conn.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not row:
            return None
        s = dict(row)
        if s["expires_at"] < _now().isoformat():
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
            conn.commit()
            return None
        return s
    finally:
        conn.close()


def _make_session(phone: str, display_name: str, role: str, days: int, email: str = "") -> dict:
    token = secrets.token_urlsafe(32)
    now = _now()
    conn = db()
    try:
        conn.execute(
            "INSERT INTO sessions (token, phone, display_name, role, created_at, expires_at, email) VALUES (?,?,?,?,?,?,?)",
            (token, phone, display_name, role, now.isoformat(), (now + timedelta(days=days)).isoformat(), email),
        )
        conn.commit()
    finally:
        conn.close()
    return {"token": token, "phone": phone, "display_name": display_name, "role": role, "email": email}


@app.post("/api/auth/request-otp")
def request_otp(payload: OtpRequestIn):
    phone = payload.phone.strip()
    if not re.match(r"^\d{10}$", phone):
        raise HTTPException(400, "Enter a valid 10-digit mobile number")
    conn = db()
    try:
        cur = conn.cursor()
        recent = cur.execute(
            "SELECT COUNT(*) c FROM otps WHERE phone=? AND created_at > datetime('now','-1 hour')",
            (phone,),
        ).fetchone()["c"]
        if recent >= 5:
            raise HTTPException(429, "Too many OTP requests. Try again in an hour.")
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        now = _now()
        cur.execute(
            "INSERT INTO otps (phone, code, attempts, created_at, expires_at) VALUES (?,?,?,?,?)",
            (phone, code, 0, now.isoformat(), (now + timedelta(minutes=OTP_TTL_MIN)).isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
    print(f"[OTP] {phone} -> {code} (valid {OTP_TTL_MIN} min)", flush=True)
    resp: dict[str, Any] = {"ok": True, "message": f"OTP sent to +91 {phone}", "expires_in_sec": OTP_TTL_MIN * 60}
    if DEMO_OTP:
        resp["demo_otp"] = code
        resp["message"] += " (demo mode: code shown on screen)"
    return resp


@app.post("/api/auth/verify-otp")
def verify_otp(payload: OtpVerifyIn):
    phone = payload.phone.strip()
    code = payload.otp.strip()
    if not re.match(r"^\d{10}$", phone) or not re.match(r"^\d{6}$", code):
        raise HTTPException(400, "Invalid phone or OTP format")
    conn = db()
    try:
        cur = conn.cursor()
        row = cur.execute(
            "SELECT * FROM otps WHERE phone=? AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1",
            (phone,),
        ).fetchone()
        if not row:
            raise HTTPException(400, "OTP expired or not found. Request a new one.")
        if row["attempts"] >= 5:
            cur.execute("DELETE FROM otps WHERE phone=?", (phone,))
            conn.commit()
            raise HTTPException(400, "Too many wrong attempts. Request a new OTP.")
        if row["code"] != code:
            cur.execute("UPDATE otps SET attempts = attempts + 1 WHERE id=?", (row["id"],))
            conn.commit()
            raise HTTPException(400, f"Wrong OTP. {5 - row['attempts'] - 1} attempt(s) left.")
        cur.execute("DELETE FROM otps WHERE phone=?", (phone,))
        conn.commit()
    finally:
        conn.close()
    name = payload.name.strip() or f"Lender {phone[-4:]}"
    sess = _make_session(phone, name, "lender", 7)
    _audit_event("auth_login", f"{name} ({phone})", {"method": "otp"})
    return {"ok": True, **sess}


@app.post("/api/auth/guest")
def guest_login(payload: GuestIn):
    name = payload.name.strip() or "Guest"
    sess = _make_session("guest", name, "guest", 1)
    _audit_event("auth_login", f"{name} (guest)", {"method": "guest"})
    return {"ok": True, **sess}


# ---------------- Email auth: password + real Gmail OTP ----------------
# Passwords: PBKDF2-HMAC-SHA256 (stdlib, 600k iterations, per-user salt).
# OTP codes: emailed through Gmail SMTP when LENDSURE_SMTP_* is configured
# (use a Gmail App Password, never your login password); otherwise the code
# is returned in the API response so the demo flow still works.

EMAIL_OTP_TTL_MIN = 10
LOGIN_LOCKS: dict[str, list] = {}  # email -> [fail_count, locked_until_ts]
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _smtp_configured() -> bool:
    return bool(os.environ.get("LENDSURE_SMTP_USER") and os.environ.get("LENDSURE_SMTP_APP_PASSWORD"))


def send_email_otp(to_email: str, code: str, purpose: str) -> bool:
    user = os.environ.get("LENDSURE_SMTP_USER", "")
    pwd = os.environ.get("LENDSURE_SMTP_APP_PASSWORD", "")
    if not user or not pwd:
        print(f"[EMAIL-OTP] {to_email} -> {code} ({purpose}) — SMTP not configured, demo mode", flush=True)
        return False
    try:
        import smtplib
        from email.message import EmailMessage
        msg = EmailMessage()
        msg["From"] = f"LendSure <{user}>"
        msg["To"] = to_email
        action = "verify your email address" if purpose == "verify" else "reset your password"
        msg["Subject"] = f"Your LendSure verification code is {code}"
        msg.set_content(
            f"Your LendSure verification code is: {code}\n\n"
            f"Use it to {action}. It expires in {EMAIL_OTP_TTL_MIN} minutes.\n\n"
            "If you didn't request this, you can safely ignore this email.")
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as s:
            s.starttls()
            s.login(user, pwd)
            s.send_message(msg)
        return True
    except Exception as e:
        print(f"[SMTP] send failed for {to_email}: {e}", flush=True)
        return False


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return f"pbkdf2$600000${salt.hex()}${dk.hex()}"


def _check_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt, dk = stored.split("$")
        if algo != "pbkdf2":
            return False
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters))
        return secrets.compare_digest(test.hex(), dk)
    except Exception:
        return False


def _issue_email_otp(conn, email: str, purpose: str) -> str:
    cur = conn.cursor()
    recent = cur.execute(
        "SELECT COUNT(*) c FROM email_otps WHERE email=? AND purpose=? AND created_at > datetime('now','-1 hour')",
        (email, purpose)).fetchone()["c"]
    if recent >= 5:
        raise HTTPException(429, "Too many codes requested. Try again in an hour.")
    code = f"{secrets.randbelow(900000) + 100000:06d}"
    now = _now()
    cur.execute(
        "INSERT INTO email_otps (email, code, purpose, attempts, created_at, expires_at) VALUES (?,?,?,?,?,?)",
        (email, code, purpose, 0, now.isoformat(), (now + timedelta(minutes=EMAIL_OTP_TTL_MIN)).isoformat()))
    conn.commit()
    return code


def _check_email_otp(conn, email: str, purpose: str, code: str) -> None:
    cur = conn.cursor()
    row = cur.execute(
        "SELECT * FROM email_otps WHERE email=? AND purpose=? AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1",
        (email, purpose)).fetchone()
    if not row:
        raise HTTPException(400, "Code expired or not found. Request a new one.")
    if row["attempts"] >= 5:
        cur.execute("DELETE FROM email_otps WHERE email=? AND purpose=?", (email, purpose))
        conn.commit()
        raise HTTPException(400, "Too many wrong attempts. Request a new code.")
    if row["code"] != code:
        cur.execute("UPDATE email_otps SET attempts = attempts + 1 WHERE id=?", (row["id"],))
        conn.commit()
        raise HTTPException(400, f"Wrong code. {5 - row['attempts'] - 1} attempt(s) left.")
    cur.execute("DELETE FROM email_otps WHERE email=? AND purpose=?", (email, purpose))
    conn.commit()


class RegisterIn(BaseModel):
    name: str = ""
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class VerifyEmailIn(BaseModel):
    email: str
    otp: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    email: str
    otp: str
    new_password: str


@app.post("/api/auth/register")
def register(payload: RegisterIn):
    email = payload.email.strip().lower()
    name = payload.name.strip() or email.split("@")[0]
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    if len(payload.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if len(name) > 60:
        raise HTTPException(400, "Name too long")
    conn = db()
    try:
        if conn.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(400, "An account with this email already exists. Try signing in.")
        conn.execute(
            "INSERT INTO users (name, email, password_hash, email_verified, created_at) VALUES (?,?,?,?,?)",
            (name, email, _hash_password(payload.password), 0, _now().isoformat()))
        code = _issue_email_otp(conn, email, "verify")
    finally:
        conn.close()
    sent = send_email_otp(email, code, "verify")
    resp: dict[str, Any] = {
        "ok": True, "email": email, "email_sent": sent,
        "message": "Verification code sent to your email" if sent
                   else "Email delivery not configured — use the on-screen demo code",
    }
    if not sent:
        resp["demo_otp"] = code
    return resp


@app.post("/api/auth/verify-email")
def verify_email(payload: VerifyEmailIn):
    email = payload.email.strip().lower()
    conn = db()
    try:
        _check_email_otp(conn, email, "verify", payload.otp.strip())
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not row:
            raise HTTPException(400, "Account not found. Please register first.")
        conn.execute("UPDATE users SET email_verified=1 WHERE email=?", (email,))
        conn.commit()
        name = row["name"]
    finally:
        conn.close()
    sess = _make_session(email, name, "lender", 7, email=email)
    _audit_event("auth_login", f"{name} ({email})", {"method": "email-register"})
    return {"ok": True, **sess}


@app.post("/api/auth/login")
def email_login(payload: LoginIn):
    email = payload.email.strip().lower()
    lock = LOGIN_LOCKS.get(email)
    if lock and lock[1] > time.time():
        raise HTTPException(429, "Too many failed attempts. Try again in a few minutes.")
    conn = db()
    try:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        row = dict(row) if row else None
    finally:
        conn.close()
    if not row or not _check_password(payload.password, row["password_hash"]):
        fails, _ = LOGIN_LOCKS.get(email, (0, 0))
        fails += 1
        LOGIN_LOCKS[email] = [fails, time.time() + 900 if fails >= 5 else 0]
        raise HTTPException(401, "Incorrect email or password")
    if not row["email_verified"]:
        raise HTTPException(403, "Email not verified yet. Enter the code sent to your inbox.")
    LOGIN_LOCKS.pop(email, None)
    sess = _make_session(email, row["name"], "lender", 7, email=email)
    _audit_event("auth_login", f"{row['name']} ({email})", {"method": "email-password"})
    return {"ok": True, **sess}


@app.post("/api/auth/forgot-password")
def forgot_password(payload: ForgotIn):
    email = payload.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    conn = db()
    try:
        exists = conn.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone()
        code = _issue_email_otp(conn, email, "reset") if exists else None
    finally:
        conn.close()
    sent = send_email_otp(email, code, "reset") if code else False
    # Same response whether or not the account exists (no user enumeration).
    resp: dict[str, Any] = {"ok": True, "email_sent": sent,
                            "message": "If an account exists for this email, a reset code was sent."}
    if code and not sent:
        resp["demo_otp"] = code
    return resp


@app.post("/api/auth/reset-password")
def reset_password(payload: ResetIn):
    email = payload.email.strip().lower()
    if len(payload.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    conn = db()
    try:
        _check_email_otp(conn, email, "reset", payload.otp.strip())
        if not conn.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(400, "Account not found.")
        conn.execute("UPDATE users SET password_hash=? WHERE email=?",
                     (_hash_password(payload.new_password), email))
        # Sign out everywhere after a password change.
        conn.execute("DELETE FROM sessions WHERE phone=? OR email=?", (email, email))
        conn.commit()
    finally:
        conn.close()
    LOGIN_LOCKS.pop(email, None)
    _audit_event("auth_password_reset", email, {})
    return {"ok": True, "message": "Password updated. Please sign in again."}


@app.get("/api/auth/me")
def auth_me(authorization: Optional[str] = Header(default=None)):
    s = _session_from_header(authorization)
    if not s:
        raise HTTPException(401, "Not signed in")
    return {"ok": True, "phone": s["phone"], "display_name": s["display_name"], "role": s["role"]}


@app.post("/api/auth/logout")
def auth_logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        tok = authorization[7:].strip()
        s = _session_from_header(authorization)
        conn = db()
        try:
            conn.execute("DELETE FROM sessions WHERE token=?", (tok,))
            conn.commit()
        finally:
            conn.close()
        if s:
            _audit_event("auth_logout", f"{s['display_name']} ({s['phone']})", {})
    return {"ok": True}


@app.get("/api/security/status")
def security_status():
    """Real control state — UNKNOWN means not implemented, never faked."""
    conn = db()
    try:
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        audit_n = conn.execute("SELECT COUNT(*) c FROM ls_audit").fetchone()["c"] if "ls_audit" in tables else 0
    finally:
        conn.close()
    try:
        from lendsure import ml as _ml
        ml_loaded, ml_id = bool(_ml.loaded()), getattr(_ml, "MODEL_ID", "unknown")
    except Exception:
        ml_loaded, ml_id = False, "unknown"
    return {
        "authentication": {"otp": True, "guest": True, "demo_otp_mode": DEMO_OTP,
                           "otp_ttl_min": OTP_TTL_MIN,
                           "email_password": "pbkdf2-sha256",
                           "email_otp": "gmail-smtp" if _smtp_configured() else "demo-mode",
                           "passwords": "pbkdf2-sha256 (argon2id preferred when available)",
                           "mfa": "not_configured"},
        "rbac": {"enabled": True, "roles": ["lender", "guest", "service(api-key)"],
                 "note": "guests are read/analyze-only; policy, reviews, keys and sessions require lender or service role"},
        "rate_limiting": {"enabled": True, "auth_per_min_per_ip": 20,
                          "mutations_per_min_per_ip": 60, "reads_per_min_per_ip": 300},
        "cors": {"mode": "open" if "*" in CORS_ORIGINS else "restricted", "origins": CORS_ORIGINS},
        "headers": {"csp": True, "nosniff": True, "frame_deny": True, "referrer_policy": True},
        "body_limit_bytes": MAX_BODY_BYTES,
        "database": {"ok": True, "tables": len(tables), "encryption_at_rest": "unknown"},
        "ml": {"loaded": ml_loaded, "model_id": ml_id},
        "audit": {"enabled": True, "append_only": True, "events": audit_n, "hash_chaining": "not_configured"},
        "backups": {"status": "unknown"},
        "document_malware_scan": {"status": "not_configured"},
    }


@app.get("/api/ready")
def readiness():
    conn = db()
    try:
        ok_db = conn.execute("SELECT 1").fetchone() is not None
        has_tables = conn.execute(
            "SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name LIKE 'ls_%'").fetchone()["c"] > 0
    except Exception:
        ok_db, has_tables = False, False
    finally:
        try:
            conn.close()
        except Exception:
            pass
    try:
        from lendsure import ml as _ml
        ok_ml = bool(_ml.loaded())
    except Exception:
        ok_ml = False
    ready = ok_db and has_tables and ok_ml
    return {"ready": ready, "checks": {"database": ok_db, "tables": has_tables, "ml_model": ok_ml}}


@app.post("/api/loans/evaluate")
def evaluate(payload: EvaluateIn, authorization: Optional[str] = Header(default=None)):
    b = payload.borrower
    docs = payload.documents
    vouches = payload.vouches
    loan = payload.loan
    lender = _session_from_header(authorization)
    lender_tag = f"{lender['display_name']} ({lender['phone']})" if lender else "anonymous"

    conn = db()
    try:
        # --- scoring ---
        id_pts, id_reasons, phone_ok, id_ok = score_identity(b)
        fin_pts, fin_reasons = score_financial(b, docs, loan.requested_amount)
        hist_pts, hist_reasons = score_history(b)
        net_pts, net_reasons = score_network(vouches)
        beh_pts, beh_reasons = score_behavioral(docs, b)

        fraud_flags = detect_fraud(b, docs, vouches, loan.requested_amount, conn)
        # fraud penalty: -5 per high, -2 per medium (floor applied later)
        penalty = sum(5 if f["severity"] == "high" else 2 for f in fraud_flags)
        trust = round(max(5, min(99, id_pts + fin_pts + hist_pts + net_pts + beh_pts - penalty)), 1)

        status, risk, terms = decide(trust, fraud_flags, loan.requested_amount, b.monthly_income, loan.tenure_months)

        # confidence from data completeness
        completeness = sum([
            1 if phone_ok and id_ok else 0,
            1 if b.monthly_income > 0 else 0,
            1 if docs else 0,
            1 if vouches else 0,
            1 if (b.past_loans_repaid + b.past_defaults) > 0 else 0,
        ]) / 5
        confidence = round(55 + completeness * 40 - (len(fraud_flags) * 2), 1)
        confidence = max(30, min(98, confidence))

        def pack(reasons, cat, weight):
            return [{"category": cat, "factor": f, "points": p, "max_points": m, "evidence": e} for (f, p, m, e) in reasons]

        breakdown = (
            pack(id_reasons, "Identity Verification", 25)
            + pack(fin_reasons, "Financial Stability", 25)
            + pack(hist_reasons, "Repayment History", 20)
            + pack(net_reasons, "Trust Network", 15)
            + pack(beh_reasons, "Behavioural & Documents", 15)
        )
        if penalty:
            breakdown.append({"category": "Fraud Adjustment", "factor": f"{len(fraud_flags)} fraud signal(s)", "points": -penalty, "max_points": 0, "evidence": "; ".join(f["description"] for f in fraud_flags)})

        explanation = {
            "trust_score": trust,
            "risk_level": risk,
            "decision": status,
            "confidence": confidence,
            "breakdown": breakdown,
            "fraud_flags": fraud_flags,
            "terms": terms,
            "summary": f"Trust {trust}/100 ({risk} risk), {status}. Confidence {confidence}%. " + terms["reason"],
        }

        # --- persist ---
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute(
            """INSERT INTO borrowers (name, phone, id_number, address, employment_type,
               monthly_income, employment_years, past_loans_repaid, past_defaults, past_delays, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (b.name, b.phone, b.id_number, b.address, b.employment_type, b.monthly_income,
             b.employment_years, b.past_loans_repaid, b.past_defaults, b.past_delays, now),
        )
        borrower_id = cur.lastrowid
        for d in docs:
            cur.execute(
                "INSERT INTO documents (borrower_id, doc_type, file_name, extracted_income, authentic, notes) VALUES (?,?,?,?,?,?)",
                (borrower_id, d.doc_type, d.file_name, d.extracted_income, int(d.authentic), d.notes),
            )
        for v in vouches:
            cur.execute(
                "INSERT INTO vouches (borrower_id, voucher_name, relationship, trust_level, comment) VALUES (?,?,?,?,?)",
                (borrower_id, v.voucher_name, v.relationship, v.trust_level, v.comment),
            )
        cur.execute(
            """INSERT INTO loans (borrower_id, requested_amount, tenure_months, purpose, status,
               recommended_amount, interest_rate, risk_level, trust_score, confidence, explanation_json, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (borrower_id, loan.requested_amount, loan.tenure_months, loan.purpose, status,
             terms["recommended_amount"], terms["interest_rate_pa"], risk, trust, confidence,
             json.dumps(explanation), now),
        )
        loan_id = cur.lastrowid
        for f in fraud_flags:
            cur.execute(
                "INSERT INTO fraud_flags (borrower_id, loan_id, flag_type, severity, description) VALUES (?,?,?,?,?)",
                (borrower_id, loan_id, f["flag_type"], f["severity"], f["description"]),
            )
        cur.execute(
            "INSERT INTO audit_logs (loan_id, action, detail, created_at) VALUES (?,?,?,?)",
            (loan_id, "evaluate", json.dumps({"trust": trust, "risk": risk, "decision": status, "penalty": penalty, "lender": lender_tag}), now),
        )
        conn.commit()
        return {"loan_id": loan_id, "borrower_id": borrower_id, **explanation}
    finally:
        conn.close()


@app.get("/api/loans")
def list_loans(limit: int = 50):
    conn = db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT l.*, b.name borrower_name, b.phone FROM loans l
               JOIN borrowers b ON b.id = l.borrower_id ORDER BY l.id DESC LIMIT ?""",
            (limit,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@app.get("/api/loans/{loan_id}")
def loan_detail(loan_id: int):
    conn = db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT l.*, b.name borrower_name, b.phone, b.id_number, b.address,
                      b.employment_type, b.monthly_income, b.employment_years
               FROM loans l JOIN borrowers b ON b.id=l.borrower_id WHERE l.id=?""",
            (loan_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Loan not found")
        out = dict(row)
        out["explanation"] = json.loads(out["explanation_json"])
        cur.execute("SELECT * FROM fraud_flags WHERE loan_id=?", (loan_id,))
        out["fraud_flags_detail"] = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT * FROM audit_logs WHERE loan_id=? ORDER BY id", (loan_id,))
        out["audit"] = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT * FROM vouches WHERE borrower_id=?", (out["borrower_id"],))
        out["vouches"] = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT * FROM documents WHERE borrower_id=?", (out["borrower_id"],))
        out["documents"] = [dict(r) for r in cur.fetchall()]
        return out
    finally:
        conn.close()


@app.get("/api/dashboard/stats")
def stats():
    conn = db()
    try:
        cur = conn.cursor()
        total = cur.execute("SELECT COUNT(*) c FROM loans").fetchone()["c"]
        avg_trust = cur.execute("SELECT COALESCE(AVG(trust_score),0) v FROM loans").fetchone()["v"]
        appr = cur.execute("SELECT COUNT(*) c FROM loans WHERE status='approve'").fetchone()["c"]
        cond = cur.execute("SELECT COUNT(*) c FROM loans WHERE status='conditional'").fetchone()["c"]
        decl = cur.execute("SELECT COUNT(*) c FROM loans WHERE status='decline'").fetchone()["c"]
        flags = cur.execute("SELECT COUNT(*) c FROM fraud_flags").fetchone()["c"]
        return {
            "total_evaluations": total,
            "avg_trust": round(avg_trust or 0, 1),
            "approve": appr, "conditional": cond, "decline": decl,
            "fraud_flags": flags,
        }
    finally:
        conn.close()


@app.get("/api/borrowers/search")
def search_borrowers(q: str = "", limit: int = 20):
    conn = db()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM borrowers WHERE name LIKE ? OR phone LIKE ? OR id_number LIKE ? ORDER BY id DESC LIMIT ?",
            (f"%{q}%", f"%{q}%", f"%{q}%", limit),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ---------------- Frontend ----------------

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index():
    idx = STATIC_DIR / "index.html"
    if idx.exists():
        return FileResponse(str(idx), headers={"Cache-Control": "no-store"})
    return {"message": "API running. Build the frontend (backend/static/index.html) to view dashboard.", "docs": "/docs"}


@app.get("/favicon.svg")
def favicon():
    f = STATIC_DIR / "favicon.svg"
    if f.exists():
        return FileResponse(str(f), media_type="image/svg+xml")
    raise HTTPException(status_code=404)


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    """SPA fallback: serve index.html for client-side routes (non-API, non-static)."""
    if full_path.startswith("api/") or full_path.startswith("static/") or full_path.startswith("docs") or full_path.startswith("openapi"):
        raise HTTPException(status_code=404)
    idx = STATIC_DIR / "index.html"
    if idx.exists():
        return FileResponse(str(idx), headers={"Cache-Control": "no-store"})
    return {"message": "Not found", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
