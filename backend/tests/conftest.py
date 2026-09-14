"""Shared fixtures: each test gets a FRESH temp database + seeded borrower.

import app runs init_db() against the real DB once (idempotent, harmless).
Every role gets its OWN TestClient (separate cookie jar, same test DB) so
guest/lender sessions never leak into each other — exactly like real users.
"""
import os
import sys

os.environ.setdefault("LENDSURE_DEMO_OTP", "1")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import app as app_module

SEED_BORROWER = (
    "B90001", "Test Borrower", 34, "Mumbai", "salaried", 60000, 200000, 24,
    "9811111111", "borrower@example.com", "1 Test Street", "dev-1", "ACC123",
    60000, 50000, 1, 20, "2026-01-01T00:00:00",
)


def _seed():
    conn = app_module.db()
    conn.execute(
        "INSERT INTO ls_borrowers (borrower_id, name, age, city, employment_type,"
        " monthly_income, requested_amount, tenure_months, phone, email,"
        " address_line, device_id, bank_account, avg_income_6m, avg_debt_6m,"
        " late_payments, max_days_past_due, created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", SEED_BORROWER)
    conn.commit()
    conn.close()


@pytest.fixture()
def _db(tmp_path):
    app_module.DB_PATH = tmp_path / "test.db"
    app_module.init_db()
    _seed()
    return tmp_path


@pytest.fixture()
def client(_db):
    with TestClient(app_module.app) as c:
        yield c


@pytest.fixture()
def lender(_db):
    with TestClient(app_module.app) as c:
        r = c.post("/api/auth/register",
                   json={"name": "T", "email": "t@example.com", "password": "Strongpass1"})
        assert r.status_code == 200, r.text
        otp = r.json()["demo_otp"]
        r = c.post("/api/auth/verify-email", json={"email": "t@example.com", "otp": otp})
        assert r.status_code == 200, r.text
        yield c


@pytest.fixture()
def guest(_db):
    with TestClient(app_module.app) as c:
        r = c.post("/api/auth/guest", json={"name": "G"})
        assert r.status_code == 200, r.text
        yield c
