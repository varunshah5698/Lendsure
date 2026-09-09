"""LendSure database schema — real relational tables, no giant JSON blobs for core facts."""
from __future__ import annotations

MODEL_VERSION = "lendsure-risk-v1.3"

DDL = """
CREATE TABLE IF NOT EXISTS ls_borrowers (
    borrower_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER, city TEXT, employment_type TEXT, employment_years REAL,
    monthly_income REAL, household_size INTEGER, dependents INTEGER,
    requested_amount REAL, tenure_months INTEGER, purpose TEXT, first_time_borrower INTEGER,
    prev_loans INTEGER, loans_repaid INTEGER, late_payments INTEGER, avg_delay_days REAL,
    defaults INTEGER, max_days_past_due INTEGER,
    avg_income_6m REAL, avg_expenses_6m REAL, avg_debt_6m REAL, income_volatility REAL,
    expense_trend REAL, debt_trend REAL, total_transactions_6m INTEGER,
    bounced_payments_6m INTEGER, disputed_txns_6m INTEGER,
    id_verification INTEGER, address_verification INTEGER, phone_verification INTEGER,
    bank_stmt_status INTEGER, income_doc_status INTEGER, doc_quality_score INTEGER,
    transaction_variance REAL, night_txn_ratio REAL, new_device_90d INTEGER, applications_30d INTEGER,
    address_changes_12m INTEGER, doc_avg_income REAL,
    vouches_count INTEGER, avg_vouch_trust REAL, community_tenure_years REAL,
    group_memberships INTEGER, guarantor_past_count INTEGER,
    account_age_months INTEGER, prev_lenders_count INTEGER, disputes_raised INTEGER, disputes_lost INTEGER,
    ontime_streak_months INTEGER, salary_credits_6m INTEGER, savings_balance REAL, existing_debt_accounts INTEGER,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ls_financials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrower_id TEXT NOT NULL,
    month INTEGER NOT NULL,
    label TEXT NOT NULL,
    income REAL, expenses REAL, debt REAL, transactions INTEGER,
    bounced INTEGER, disputed INTEGER,
    UNIQUE (borrower_id, month)
);
CREATE INDEX IF NOT EXISTS idx_ls_fin_b ON ls_financials (borrower_id);
CREATE TABLE IF NOT EXISTS ls_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrower_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    status TEXT NOT NULL,
    quality_score INTEGER,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ls_doc_b ON ls_documents (borrower_id);
CREATE TABLE IF NOT EXISTS ls_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrower_id TEXT NOT NULL,
    model_version TEXT NOT NULL,
    risk_score REAL, risk_level TEXT,
    fraud_score REAL, fraud_risk TEXT,
    trust_score REAL, confidence REAL,
    decision TEXT,
    recommended_amount REAL, interest_rate REAL, duration_months INTEGER, monthly_payment REAL,
    ml_score REAL,
    risk_factors TEXT DEFAULT '[]',
    fraud_signals TEXT DEFAULT '[]',
    trust_factors TEXT DEFAULT '[]',
    input_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS idx_ls_an_b ON ls_analyses (borrower_id);
CREATE TABLE IF NOT EXISTS ls_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id INTEGER NOT NULL UNIQUE,
    borrower_id TEXT NOT NULL,
    recommended_amount REAL, interest_rate REAL, duration_months INTEGER,
    monthly_payment REAL, total_repayment REAL, decision TEXT, rationale TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ls_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ls_ev_a ON ls_evidence (analysis_id);
CREATE TABLE IF NOT EXISTS ls_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrower_id TEXT NOT NULL,
    analysis_id INTEGER,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ls_au_b ON ls_audit (borrower_id);
CREATE TABLE IF NOT EXISTS ls_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ls_api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used TEXT,
    revoked INTEGER DEFAULT 0
);
"""

DEFAULT_CONFIG = {
    "model_version": MODEL_VERSION,
    "risk_low_max": 35,
    "risk_medium_max": 65,
    "fraud_low_max": 30,
    "fraud_medium_max": 60,
    "interest_low": [8.0, 10.0],
    "interest_medium": [11.0, 15.0],
    "interest_high": [16.0, 20.0],
    "afford_base_mult": 2.0,
    "afford_trust_mult": 6.0,
    "max_tenure_months": 24,
    "high_risk_tenure_cap": 12,
    "manual_review_fraud_score": 60,
    "reject_risk_score": 80,
    "min_recommended_ratio": 0.6,
    "approve_trust_min": 70,
    "ml_blend": 0.5,
}
