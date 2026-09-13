# LendSure – My Project Note

Varun Shah, September 2026. Short note on my project for my mentor, answered question by question.

## Q1. What features does your current application have?

I built LendSure as a lending decision-support app. It studies a borrower and suggests approve, approve with conditions, or decline, always with written reasons attached. It never approves anything by itself. A human lender makes the final call.

It starts with a landing page I designed to look like a real product, then a login screen with three entries: mobile number with a one-time password, one-click guest access, and email registration with verification plus forgot and reset password. I kept three options so nobody gets stuck at login during a demo. Since I had no SMS service, the mobile code simply appears on the screen in demo mode.

After login comes the dashboard: total borrowers (around fifteen hundred in our demo data), low-medium-high risk counts, possible fraud count, pending verifications, average trust and confidence scores, an early warnings feed for missed repayments and sudden score drops, money totals for disbursed versus outstanding versus repaid, and a table of recently analysed borrowers.

The borrowers page is a searchable, filterable list by risk, verification status, city and job type. Opening a borrower shows the detail page, which is the heart of my app: a trust score out of hundred split into identity, finances, past loan record, community network and behaviour, each with points and a one-line reason; nine fraud checks such as duplicate phones, fake-looking identity details, or loan demands far above income; the decision with suggested amount, interest, instalment and duration; and extra conditions for risky cases like collateral or a guarantor. I also added a what-if simulator on the same page because I felt a lender would naturally ask what happens if the income were higher, and the app should answer without saving anything.

There is a small question-answer box I call copilot. To be clear, it is not an AI chatbot. It is a fixed set of rules I wrote that convert common questions into data queries and quote the results, so it can never invent numbers but only understands the questions I prepared.

The rest covers the loan process: requests moving from draft to approve or reject, real loans with monthly schedules, repayments that cannot double-charge, and an investigation list for suspicious cases. Admins get a command-centre overview, a page to change the app's own risk rules without touching code, access-key management, and model performance numbers. There is also a market section with live prices and news that falls back to labelled sample data when outside services are down, plus notifications with a live warning stream, a keyboard shortcut palette, and ready-made demo scenarios.

## Q2. What is your tech stack — backend, frontend, API keys?

My backend is Python with FastAPI running on uvicorn, with a simple SQLite database file and plain SQL queries, no heavy layers. The scoring mixes a trained gradient-boosting model with hand-written rules in equal parts, and every saved result records which model version produced it so results stay checkable later. My frontend is React with Vite, page navigation by React Router, animations by a motion library, and 3D landing visuals by a graphics library, styled with plain CSS files. All browser-to-server talk is simple same-domain requests from one helper file.

For keys and configuration, the app reads settings from environment variables: a demo-mode flag for showing login codes on screen, an optional free news key for real headlines, and an optional email account for sending real login codes, without which codes just print in the server log. Lenders can also get personal API keys from the admin page, stored only as irreversible hashes. Everything external is contacted from the server, so no secret ever reaches the browser. I pack the whole thing into one container and deploy it on Render, with a second setup on Vercel that keeps frontend and backend on one domain.

## Q3. What are all the endpoints and the database schema?

My backend has close to a hundred small endpoints, grouped by purpose: health checks for the database, model and market data; the full login group including mobile codes, guest entry, email registration and verification, login, logout and password reset; dashboard counts, averages and trends; borrower listing, search, filtering, profiles, financial history, running and reading analyses, evidence, recommendations, risk history and audit trails; unsaved what-if simulations; document upload, download and verification; loan requests moving through submit, review, approve, reject and withdraw; created loans and repayment recording; investigation cases; the admin group for overview, statistics, live policy changes, model info, audit logs, approvals, sessions, access keys, background jobs and demo scenarios; borrower network graphs and paths; warnings, portfolio aggregates, the copilot question endpoint, notifications with a live stream; and about seventeen finance endpoints for markets, news, economy, watchlist, alerts and briefings. A few unused endpoints from my first version still exist.

The database is one SQLite file of about twelve megabytes with around twenty tables. In simple terms it stores borrower profiles, six months of monthly financial history per borrower, documents and their verification status, every analysis ever run with scores, decision, terms, reasons and model version, the evidence lines behind each analysis, a permanent log of who did what, the app's tunable policy settings, hashed API keys, loan requests with approval status, loans with repayment schedules and recorded repayments, background jobs, notifications and the event log feeding the live stream, investigation cases, repayment performance that feeds back into future scores, uploaded file contents, and a log of model probabilities. Some leftover tables from my first version sit unused in the same file.

## Q4. What do you think are the flaws, and what needs to be done?

Honestly, my first version and my rebuilt engine both live in the same codebase and I never cleaned out the old half, so a newcomer cannot tell which part is real. I would delete the dead code first.

The single-file database cannot handle real concurrent use, committing it into git was a lazy decision I regret, and on serverless hosting the data just resets. It was right for a zero-setup demo and wrong for anything beyond. I would move to Postgres with proper migrations and stop committing the database file.

Login is demo-grade: codes on screen, tokens in browser storage, limits in server memory, keys that never expire. For a lending product this worries me most, so sessions should move to secure cookies with key expiry and proper limits.

I want to be upfront that my training data is synthetic, made by my own script, so the high accuracy number partly means the model agrees with my generator. The roughly one-in-three wrong fraud-flag rate is the number I actually worry about, and the half-rules half-model mix was my own choice, not a tuned value, with no retraining pipeline. If my mentor asks one hard question, I hope it is this one.

Smaller issues: demo borrowers mix into normal lists with no separate environment or reset button, there is not a single automated test anywhere, the frontend has no type checking, and there is no continuous integration. Given one more month, I would do dead-code cleanup, Postgres, tests around the scoring logic, and proper login, in that order. The app works end to end and the audit trail behind every decision is the part I am proudest of, but I would never call it production-ready.
