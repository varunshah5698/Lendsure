# LendSure — what I built, how it's put together, and what's still broken

Varun Shah, Sept 2026. I'm writing this up for my mentor review so everything is in one place. This is only about the LendSure app (the `trust-risk-intelligence` folder in my repo) — that's the thing that's actually deployed. If anything below looks wrong or unclear, that's on me, ask and I'll explain.

## 1. Features — what the app actually does

Going screen by screen, in the order a user would hit them:

**1. Landing page.** Marketing-style front page for the product. It has some 3D animated scenes (built with react-three-fiber — a risk-core visual and an approval-wave visual) plus the usual product sections. Honestly it's there to make the demo look serious before anyone logs in.

**2. Login.** Three ways in: (a) enter any 10-digit mobile number, get a 6-digit OTP — but in demo mode the OTP just shows up on screen, no real SMS involved; (b) "Continue as Guest" for one-click access; (c) email + password register/login with email OTP verification, plus forgot/reset password. Lender sessions last 7 days, guest sessions 24 hours. The token sits in localStorage (more on why that's not great in section 4).

**3. Dashboard.** The main screen after login. Shows the portfolio at a glance: total borrowers (1,505 in the current seeded data), low/medium/high risk buckets (1,069 / 225 / 211), high-severity fraud count, pending-verification queue, average trust score (~73) and average confidence (~88%). Below that there's an Early Warnings feed (missed installments, risk drops of 15+ points, HIGH fraud flags), a Portfolio Intelligence card (disbursed / outstanding / repaid money, active exposure split by risk), and a Recent Borrowers table. Everything renders from live DB rows, and there's a fun bug I fixed literally today where avg trust and confidence showed dashes because the backend endpoint wasn't returning those two fields.

**4. Borrowers explorer.** Searchable, filterable list of all borrowers — filter by risk level, verification bucket, city, employment type, sort by trust or loan amount, paginated 12 per page. Clicking a row opens the detail page.

**5. Borrower detail page.** This is the heart of the app. For one borrower you get: a trust score (0-100) broken across 5 dimensions (Identity 25, Financial 25, History 20, Network 15, Behavioural 15), each with its own points and a one-line evidence string; a fraud screen against 9 rules (duplicate phone/ID, bad ID formats, asking >10x income, income mismatch vs documents, suspect docs, repeat defaults, application velocity spike, vouching for yourself); a risk level; a lending decision (approve / conditional / decline) with recommended amount, risk-based interest (roughly 10-28%), EMI and tenure; collateral/guarantor/tranche conditions for risky cases; a confidence percentage; a full evidence list; and an audit trail of everything ever done to that borrower. There are extra tabs for risk history over time, a network graph of the borrower's connections (shared phones, devices, guarantors), and a document viewer.

**6. What-if simulator.** On the borrower page you can tweak inputs (income, requested amount, documents, etc.) and re-run the analysis without saving anything, to see how the decision flips. Same engine as the real analysis, just not persisted.

**7. Copilot.** A Q&A box where you ask things about the portfolio in plain English and it answers from live records. Important: this is NOT an LLM — it's a deterministic rule-based analyst I wrote (pattern matching over real queries). It never hallucinates numbers because it only quotes query results. The flip side is it only understands the question patterns I coded for.

**8. Loan requests and loans.** Full lifecycle: a request starts as DRAFT, gets submitted, then a lender can approve / reject / ask for more info / withdraw it. Approving creates a real loan with an EMI schedule; repayments get recorded against schedule rows (with idempotency keys so double-clicks don't double-charge). Loan detail pages show outstanding vs repaid.

**9. Cases.** Investigation cases you can open against a borrower (usually from a fraud flag), attach evidence, and resolve. Basically a to-do list for suspicious files.

**10. Admin section.** Four pages: an overview/command-center (decision mix, pending reviews, model version, 14-day volume, recent activity), a policy page where the risk thresholds, interest bands, affordability multipliers and review cutoffs are editable live (no redeploy needed), an API-keys page (create/rotate/revoke per-lender keys), and a model page showing ML performance metrics.

**11. Financial intelligence section.** This is the "market terminal" part: portfolio overview, live markets (real prices from Yahoo Finance, no key needed, refreshes every 15 min, with LIVE/STALE badges), live news headlines (needs a free NewsAPI key, otherwise falls back to seeded headlines and says so), a ticker tape, a market heatmap, a currency converter, an economy page, a credit-environment page, a watchlist, alerts, and an auto-generated briefing. If the market APIs are down it degrades to seeded data and labels it — it never pretends dead data is live.

**12. Notifications.** A bell icon with unread count, a notifications list, and a live event stream over SSE so new warnings pop in without refresh.

**13. Small things that tie it together:** a Cmd-K command palette for jumping anywhere, toasts for errors, an offline banner with mock fallbacks if the backend is down, and a simulations page with prebuilt scenarios (healthy borrower vs missed-payments borrower) plus cleanup.

## 2. Tech stack

**Backend:** Python + FastAPI, served with uvicorn on port 8000. The database layer is just the Python standard-library `sqlite3` module — no ORM, raw SQL everywhere. Request validation with pydantic. One process serves both the API and the built frontend (the React build output lives in `backend/static/` and FastAPI serves it, so a single container is the whole app).

**ML:** scikit-learn gradient boosting, trained by `backend/train_model.py` on 1,500 seeded synthetic borrowers × 51 features, plus 15 engineered ratios (debt-to-income, repayment capacity, vouch strength, etc. — 66 features go into the actual model). Current artifact is `lendsure-ml-v3.2`: held-out AUC ~0.946, accuracy 86%, recall ~80%, precision ~0.66, with Platt-sigmoid calibration. At serve time the final score is a 50/50 blend of deterministic rules and the ML probability — same input always gives same output, and every analysis row stores the model version, the ML probability, and the factor breakdown so it's auditable. If the model file is missing the engine falls back to rules-only and says so in the response.

**Frontend:** React 19 + Vite + react-router v7, framer-motion for animations, three.js (fiber + drei) for the landing-page 3D stuff. Styling is plain per-component CSS files — no Tailwind, no component library. API calls are plain `fetch` in one file (`frontend/src/lib/api.js`), all same-origin under `/api`, so no CORS pain in production. No TypeScript — it's all JSX, which I'd change if I started over.

**Database:** a single SQLite file, `backend/lending.db` (~12 MB), with ~20 tables in two groups: the `ls_*` tables for the real engine (borrowers, financials, documents, analyses, recommendations, evidence, audit, config, api_keys, plus loan_requests, loans, schedule, repayments, jobs, notifications, events, cases, borrower_perf, doc_files, predictions) and a set of older non-prefixed tables from an earlier version of the code (borrowers, loans, fraud_flags, otps, sessions, users...). Yes, both exist in the same file — that's one of the flaws, see section 4.

**API keys and env config (the honest list):** `LENDSURE_DEMO_OTP` (1 = show OTP on screen, 0 = expect a real SMS gateway — there's no gateway wired, so it's always 1 in practice), `LENDSURE_OTP_TTL_MIN`, `LENDSURE_CORS_ORIGINS`, `LENDSURE_MAX_BODY_BYTES`, `NEWS_API_KEY` (optional, free NewsAPI key for real headlines), `LENDSURE_SMTP_USER` + `LENDSURE_SMTP_APP_PASSWORD` (optional Gmail app-password for real email OTPs; without them the code just prints the OTP to the server log). Per-lender API keys are created in Admin → API keys, stored as SHA-256 hashes (only a prefix is shown), and sent as the `X-API-Key` header. Nothing secret ever goes to the browser — all third-party calls happen server-side.

**Deploy setup:** a single-container Dockerfile (Node stage builds the React app, Python 3.12-slim stage runs uvicorn), a `render.yaml` for Render (free plan, health check at `/api/health`), and a `vercel.json` using Vercel Services (vite frontend service + `app:app` FastAPI backend service, `/api/*` routed to backend, everything else to frontend). Local dev is `./start.sh`, app at `http://127.0.0.1:8000`.

## 3. Endpoints and database schema

There are roughly 100 routes. All API routes live under `/api`. The lendsure engine router is mounted at `/api/ls`, finance at `/finance`, plus a few legacy routes straight on `/api`. Grouped:

**Health / meta:** `GET /api/health`, `GET /api/health/db`, `/api/health/ml`, `/api/health/graph`, `/api/health/financial-data`, `GET /api/ready`, `GET /api/security/status`.

**Auth:** `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/guest`, `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `GET /api/auth/me`, `POST /api/auth/logout`. OTPs are 6-digit, 5-minute expiry, 5 wrong attempts then burned. Rate limits are strictest here (20/min per IP).

**Dashboard:** `GET /api/ls/dashboard/metrics` (counts by risk/fraud/verification, avg trust, avg confidence, recent borrowers), `GET /api/ls/dashboard/trends` (monthly portfolio averages for charts). There's also a legacy `GET /api/dashboard/stats` from the old schema that nothing uses anymore — leftover.

**Borrowers + analysis:** `GET /api/ls/borrowers` (search/filter/sort/paginate), `GET /api/ls/borrowers/{id}`, `GET .../financials`, `POST .../analyze` (run and persist a full analysis), `GET .../analysis` (latest), `GET .../evidence`, `GET .../recommendation`, `GET .../risk-history`, `GET .../audit`, `POST /api/ls/recommendations/simulate` (what-if, not persisted), plus legacy `POST /api/loans/evaluate`, `GET /api/loans`, `GET /api/loans/{id}`, `GET /api/borrowers/search` from the old code.

**Documents:** `GET/POST /api/ls/borrowers/{id}/documents`, `POST .../documents/upload` (multipart file, stored as blob with SHA-256), `GET /api/ls/documents/{id}/file`, `PATCH /api/ls/documents/{id}` (verify/flag + note).

**Loan lifecycle + cases:** `POST/GET /api/ls/loan-requests`, `GET /api/ls/loan-requests/{id}`, `POST .../submit`, `.../withdraw`, `.../review`, `.../request-info`, `.../reject`, `.../approve`, `GET /api/ls/loans`, `GET /api/ls/loans/{id}`, `POST /api/ls/loans/{id}/repayments`, `POST/GET /api/ls/cases`, `GET /api/ls/cases/{id}`, `POST /api/ls/cases/{id}/resolve`.

**Admin:** `GET /api/ls/admin/overview`, `/api/ls/admin/stats`, `GET/PUT /api/ls/admin/config`, `GET /api/ls/admin/model`, `GET /api/ls/admin/audit`, `GET /api/ls/admin/approvals`, `POST /api/ls/admin/approvals/{id}/review`, `GET /api/ls/admin/sessions`, `DELETE /api/ls/admin/sessions/{token}`, `POST/GET /api/ls/admin/keys` + `POST .../{id}/revoke`, `GET /api/ls/admin/features`, `/api/ls/admin/registry`, `GET/POST /api/ls/admin/jobs` + retry, `POST/GET /api/ls/admin/simulate/scenario(s)` + cleanup.

**Graph:** `GET /api/ls/borrowers/{id}/graph`, `.../network-summary`, `POST /api/ls/graph/path`, `GET /api/ls/graph/clusters`, `/api/ls/graph/stats`.

**Intel + copilot + notify:** `GET /api/ls/admin/model/monitoring`, `GET /api/ls/intel/warnings`, `/api/ls/intel/portfolio`, `POST /api/ls/copilot/ask`, `GET /api/ls/notifications`, `/unread-count`, `POST .../{id}/read`, `GET /api/ls/events`, `POST /api/ls/events/ticket`, `GET /api/ls/events/stream` (SSE).

**Finance (17 routes):** `GET /finance/overview`, `/markets`, `/markets/{symbol}`, `/news`, `/news/ticker`, `/news/{id}`, `/economy`, `/credit-environment`, `/watchlist`, `POST /watchlist/add`, `POST /watchlist/remove`, `GET /alerts`, `POST /alerts/{id}/read`, `GET /ticker`, `/briefing`, `/sources`, `/portfolio-impact`.

**Database schema** (file: `backend/lendsure/schema.py`, data: `backend/lending.db`). Core tables: `ls_borrowers` (51-feature borrower profile, PK `borrower_id`), `ls_financials` (6 monthly rows per borrower), `ls_documents` (ID/income/address proofs + review status), `ls_analyses` (one row per analysis run — scores, decision, terms, ml_score, factor JSON, full input snapshot, model version), `ls_recommendations` (1:1 with analysis — terms + rationale), `ls_evidence` (per-factor evidence lines), `ls_audit` (every action stamped with actor), `ls_config` (live policy knobs), `ls_api_keys` (hash + prefix + revoke flag). Lifecycle tables: `ls_loan_requests` (status machine + idempotency key), `ls_loans`, `ls_schedule` (EMI rows), `ls_repayments`, `ls_jobs` (background work + retries), `ls_notifications`, `ls_events` (append-only log that feeds SSE), `ls_cases`, `ls_borrower_perf` (repayment feedback folded back into future analyses), `ls_doc_files` (upload blobs), `ls_predictions` (ML probability log). A handful of `ALTER TABLE` migrations run at boot. And separately, the legacy tables from the first version (`borrowers`, `loans`, `fraud_flags`, `otps`, `sessions`, `users`, `email_otps`...) still get created in the same file but the new code mostly ignores them.

## 4. Flaws, honestly, and what I'd do about them

**The codebase has two apps in one.** The old non-prefixed tables and endpoints (`/api/loans/evaluate`, `/api/dashboard/stats`, etc.) are dead weight next to the `ls_*` engine, and both DDL blocks run at boot. Anyone new to the repo will be confused about which one is real. First thing I'd do: delete the legacy half entirely and keep one dashboard endpoint.

**SQLite is the biggest structural risk.** One file, no real concurrency (two uvicorn workers would lock each other), and I committed the 12 MB database into git, which is ugly — every data churn shows up as a binary diff. It also means the Vercel deploy has ephemeral storage (data resets) and there's no backup story anywhere. The fix is Postgres + a real migration setup, seed scripts for demo data, and gitignoring the db file. I haven't done it because SQLite made the hackathon-era demo zero-setup, but for anything real it has to go.

**Auth is demo-grade.** OTP codes printed on screen, session tokens in localStorage (an XSS hole), rate limits kept in a Python dict (a restart wipes them, and they don't work across processes), API keys with no expiry and no scopes. For a lending product this is the scariest part. I'd move sessions to httpOnly cookies, add key expiry/scopes, and put rate limiting somewhere shared.

**The ML numbers flatter the project.** The labels are synthetic (generated by my own script with its own seed), so an AUC of 0.94 is the model agreeing with my generator, not with the real world. Precision is 0.66, meaning roughly one in three predicted defaults is wrong — for a tool that influences lending decisions that's the number I'd put in bold, not the AUC. The 50/50 rules-vs-ML blend was my choice, not a tuned parameter, and there's no retraining pipeline or CI checking any of it. If my mentor asks one hard question I hope it's this one, because it's the most important caveat in the whole project.

**Demo data leaks into "production" views.** The `SIM-*` simulation borrowers sit in the same tables as everything else and show up in the Recent Borrowers list. There's no environment separation and no one-click reset. I'd split demo/simulation rows out (or at least tag and filter them) and add a reset button.

**No tests, no TypeScript, heavy frontend.** There is no test suite at all — backend or frontend. The frontend is plain JSX, so refactors are scary, and the three.js landing bundle throws >500 kB chunk warnings. I'd start with tests around the scoring engines and the API (they're pure functions, easy wins), then migrate the highest-churn components to TS.

**Deployments are held together decently but not monitored.** No CI, no lint gate, Render free tier sleeps, Vercel can't persist SQLite. Fine for a demo, not for users. CI + Postgres + one real health alert would be my minimum before showing this to anyone outside a review.

That's the full picture as of tonight. The app works end to end and I'm proud of the auditability part (every decision carries its evidence and model version — most lending demos skip that), but I'd never call it production-ready, and the list above is exactly what I'd work through first.
