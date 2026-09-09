# LendSure — Lending decisions with evidence

Full-stack AI lending-intelligence product: marketing landing page → OTP/guest auth → dashboard terminal → borrower explorer → per-borrower intelligence (risk, fraud, trust, explainability, evidence, recommendation, what-if simulator, audit) → admin with live risk-policy config.

Decision-support (not auto-approval): every recommendation is explainable, auditable, evidence-backed.

## Run
```bash
cd trust-risk-intelligence/backend
pip install -r requirements.txt   # fastapi, uvicorn, pydantic, sklearn, pandas, joblib
python data_gen.py          # 1,500 borrowers x 51 features (seeded, reproducible)
python train_model.py       # labels (own seed) -> gradient boosting -> models/risk_model.joblib + metrics (AUC 0.84)
python import_lendsure.py   # CSV -> SQLite + ML-blended baseline analysis for all 1,500
python app.py
```
Open → http://127.0.0.1:8000 (landing) · workspace → `#/dashboard` · API docs → http://127.0.0.1:8000/docs

## Intelligence
Deterministic rules blended 50/50 with a trained gradient-boosting default model
(`lendsure-ml-v2.0`, 51 features + 5 engineered ratios, held-out AUC 0.928 / accuracy 89.1%).
Same input always yields the same output; every analysis stores its model version,
ML probability, factor breakdown, evidence and audit trail. Retrain anytime with
`train_model.py`, then re-run `import_lendsure.py` to refresh baselines.

## API keys & environments
- Per-lender keys: create/rotate in **Admin → API keys**, send as `X-API-Key`
  header. Every key action is stamped in the audit log; keys are stored hashed.
  Example: `curl -H "X-API-Key: ls_..." http://127.0.0.1:8000/api/ls/dashboard/metrics`
- `LENDSURE_DEMO_OTP=0` disables demo-mode OTP echo (wire a real SMS gateway),
  `LENDSURE_OTP_TTL_MIN` sets OTP lifetime. Sessions: 7-day lenders, 24-h guests.

## How it maps to the PS
1. **Intelligent Verification & Trust Profiling** — ID/phone/address checks + 0-100 trust score across 5 dimensions (Identity 25, Financial 25, History 20, Network 15, Behavioural 15).
2. **AI-Powered Risk & Fraud Intelligence** — 9 rules: duplicate phone/ID, invalid formats, over-leverage (>10x income), income mismatch, suspect docs, repeat defaults, velocity spike, self-vouch. Each with severity + description.
3. **Personalized Lending Decision Engine** — approve / conditional / decline + recommended amount (trust-weighted affordability), risk-based interest (10-28%), EMI, collateral/guarantor/tranche logic.
4. **Explainable Dashboard** — score gauge, per-factor points + evidence strings, fraud cards, terms card, confidence %, full audit trail. SQLite persists borrowers, docs, vouches, loans, flags, audit_logs.

## Key API
- Auth: `POST /api/auth/request-otp` → `POST /api/auth/verify-otp` (6-digit, 5-min expiry, rate-limited) · `POST /api/auth/guest` (24-h session) · `GET /api/auth/me` · `POST /api/auth/logout`
- `POST /api/loans/evaluate` — one-call borrower + docs + vouches + loan → trust/risk/terms/explanation (persisted, lender identity stamped in audit log)
- `GET /api/loans`, `GET /api/loans/{id}`, `GET /api/dashboard/stats`, `GET /api/borrowers/search?q=`

## Sign-in (demo OTP mode)
Open the app → enter any 10-digit mobile → the 6-digit OTP appears on screen (and in the server log) — no SMS provider needed. Or **Continue as Guest** for instant access. Sessions persist via token in `localStorage` (7 days lender, 24 h guest). Set `DEMO_OTP = False` in `backend/app.py` when wiring a real SMS gateway.

## Try fraud detection
In the dashboard check “Salary slip (suspect)” or reuse phone `9876543210` / request >10x income → see high-severity flags, score penalty, conditional/decline flip with reasons.

## Stack
Backend: FastAPI + SQLite (stdlib, zero ORM). Frontend: vanilla HTML/CSS/JS in `backend/static/` served by the same app (true frontend↔backend↔DB split via REST). No build step — ideal for hackathon demo.
