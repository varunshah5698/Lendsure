const BASE = "/api";

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api(path, opts = {}, token = null) {
  let r;
  try {
    r = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
        ...(opts.headers || {}),
      },
    });
  } catch (e) {
    throw new Error(
      "Cannot reach the LendSure server. Start it first by running " +
      "`./start.sh` in the project folder (or: python3 -m uvicorn app:app --host 127.0.0.1 --port 8000 in backend/)."
    );
  }
  if (r.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const body = await r.json();
      msg = body.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// Auth
export const auth = {
  requestOtp: (phone, name) =>
    api("/auth/request-otp", { method: "POST", body: JSON.stringify({ phone, name }) }),
  verifyOtp: (phone, otp, name) =>
    api("/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, otp, name }) }),
  guest: (name) =>
    api("/auth/guest", { method: "POST", body: JSON.stringify({ name }) }),
  register: (name, email, password) =>
    api("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  verifyEmail: (email, otp) =>
    api("/auth/verify-email", { method: "POST", body: JSON.stringify({ email, otp }) }),
  emailLogin: (email, password) =>
    api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  forgotPassword: (email) =>
    api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (email, otp, new_password) =>
    api("/auth/reset-password", { method: "POST", body: JSON.stringify({ email, otp, new_password }) }),
  me: (token) => api("/auth/me", {}, token),
  logout: (token) => api("/auth/logout", { method: "POST" }, token),
};

// Dashboard
export const dashboard = {
  metrics: (token) => api("/ls/dashboard/metrics", {}, token),
  trends: (token) => api("/ls/dashboard/trends", {}, token),
};

// Borrowers
export const borrowers = {
  list: (params = {}, token) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v && v !== "all") q.set(k, v); });
    const qs = q.toString();
    return api(`/ls/borrowers${qs ? `?${qs}` : ""}`, {}, token);
  },
  get: (id, token) => api(`/ls/borrowers/${id}`, {}, token),
  financials: (id, token) => api(`/ls/borrowers/${id}/financials`, {}, token),
  analyze: (id, token) => api(`/ls/borrowers/${id}/analyze`, { method: "POST" }, token),
  analysis: (id, token) => api(`/ls/borrowers/${id}/analysis`, {}, token),
  evidence: (id, token) => api(`/ls/borrowers/${id}/evidence`, {}, token),
  audit: (id, token) => api(`/ls/borrowers/${id}/audit`, {}, token),
};

// Documents
export const documents = {
  list: (bid, token) => api(`/ls/borrowers/${bid}/documents`, {}, token),
  create: (bid, data, token) =>
    api(`/ls/borrowers/${bid}/documents`, { method: "POST", body: JSON.stringify(data) }, token),
  patch: (docId, data, token) =>
    api(`/ls/documents/${docId}`, { method: "PATCH", body: JSON.stringify(data) }, token),
};

// Simulation
export const simulation = {
  run: (data, token) =>
    api("/ls/recommendations/simulate", { method: "POST", body: JSON.stringify(data) }, token),
};

// Admin
export const admin = {
  stats: (token) => api("/ls/admin/stats", {}, token),
  config: (token) => api("/ls/admin/config", {}, token),
  updateConfig: (key, value, token) =>
    api("/ls/admin/config", { method: "PUT", body: JSON.stringify({ key, value }) }, token),
  model: (token) => api("/ls/admin/model", {}, token),
  audit: (limit, token) => api(`/ls/admin/audit?limit=${limit || 50}`, {}, token),
  keys: (token) => api("/ls/admin/keys", {}, token),
  createKey: (name, token) =>
    api("/ls/admin/keys", { method: "POST", body: JSON.stringify({ name }) }, token),
  revokeKey: (id, token) =>
    api(`/ls/admin/keys/${id}/revoke`, { method: "POST" }, token),
  overview: (token) => api("/ls/admin/overview", {}, token),
  approvals: (params = {}, token) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") q.set(k, v); });
    const qs = q.toString();
    return api(`/ls/admin/approvals${qs ? `?${qs}` : ""}`, {}, token);
  },
  reviewApproval: (id, data, token) =>
    api(`/ls/admin/approvals/${id}/review`, { method: "POST", body: JSON.stringify(data) }, token),
  sessions: (token) => api("/ls/admin/sessions", {}, token),
  revokeSession: (sessionToken, token) =>
    api(`/ls/admin/sessions/${sessionToken}`, { method: "DELETE" }, token),
};

// Financial Intelligence
export const finance = {
  overview: (token) => api("/finance/overview", {}, token),
  markets: (params = {}, token) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v && v !== "all") q.set(k, v); });
    const qs = q.toString();
    return api(`/finance/markets${qs ? `?${qs}` : ""}`, {}, token);
  },
  marketDetail: (symbol, range_ = "3M", token) =>
    api(`/finance/markets/${encodeURIComponent(symbol)}?range=${range_}`, {}, token),
  news: (params = {}, token) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v && v !== "all" && v !== "") q.set(k, v); });
    const qs = q.toString();
    return api(`/finance/news${qs ? `?${qs}` : ""}`, {}, token);
  },
  newsArticle: (id, token) => api(`/finance/news/${id}`, {}, token),
  economy: (token) => api("/finance/economy", {}, token),
  creditEnvironment: (token) => api("/finance/credit-environment", {}, token),
  watchlist: (token) => api("/finance/watchlist", {}, token),
  addToWatchlist: (symbol, token) =>
    api(`/finance/watchlist/add?symbol=${encodeURIComponent(symbol)}`, { method: "POST" }, token),
  removeFromWatchlist: (symbol, token) =>
    api(`/finance/watchlist/remove?symbol=${encodeURIComponent(symbol)}`, { method: "POST" }, token),
  alerts: (params = {}, token) => {
    const q = new URLSearchParams();
    if (params.unread_only) q.set("unread_only", "true");
    const qs = q.toString();
    return api(`/finance/alerts${qs ? `?${qs}` : ""}`, {}, token);
  },
  markAlertRead: (id, token) => api(`/finance/alerts/${id}/read`, { method: "POST" }, token),
  ticker: (token) => api("/finance/ticker", {}, token),
  briefing: (token) => api("/finance/briefing", {}, token),
  portfolioImpact: (token) => api("/finance/portfolio-impact", {}, token),
  sources: (token) => api("/finance/sources", {}, token),
  newsTicker: (token) => api("/finance/news/ticker", {}, token),
};

// Loan lifecycle
export const loans = {
  requests: (params = {}, token) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") q.set(k, v); });
    const qs = q.toString();
    return api(`/ls/loan-requests${qs ? `?${qs}` : ""}`, {}, token);
  },
  getRequest: (id, token) => api(`/ls/loan-requests/${id}`, {}, token),
  createRequest: (data, token) =>
    api("/ls/loan-requests", { method: "POST", body: JSON.stringify({ ...data, idempotency_key: data.idempotency_key || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }) }, token),
  transition: (id, action, body = {}, token) =>
    api(`/ls/loan-requests/${id}/${action}`, { method: "POST", body: JSON.stringify(body) }, token),
  approve: (id, body = {}, token) =>
    api(`/ls/loan-requests/${id}/approve`, { method: "POST", body: JSON.stringify(body) }, token),
  list: (params = {}, token) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") q.set(k, v); });
    const qs = q.toString();
    return api(`/ls/loans${qs ? `?${qs}` : ""}`, {}, token);
  },
  get: (id, token) => api(`/ls/loans/${id}`, {}, token),
  repay: (id, body, token) =>
    api(`/ls/loans/${id}/repayments`, { method: "POST", body: JSON.stringify({ ...body, idempotency_key: body.idempotency_key || `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }) }, token),
};

// Graph intelligence
export const graph = {
  neighborhood: (bid, hops = 2, token) => api(`/ls/borrowers/${bid}/graph?hops=${hops}`, {}, token),
  summary: (bid, token) => api(`/ls/borrowers/${bid}/network-summary`, {}, token),
  path: (from_borrower, to_borrower, token) =>
    api("/ls/graph/path", { method: "POST", body: JSON.stringify({ from_borrower, to_borrower }) }, token),
  clusters: (token) => api("/ls/graph/clusters", {}, token),
  stats: (token) => api("/ls/graph/stats", {}, token),
};

// Background jobs
export const jobs = {
  list: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return api(`/ls/admin/jobs${q ? `?${q}` : ""}`, {}, token);
  },
  retry: (id, token) => api(`/ls/admin/jobs/${id}/retry`, { method: "POST" }, token),
};

// Notifications + live stream
export const notify = {
  list: (token) => api("/ls/notifications", {}, token),
  unread: (token) => api("/ls/notifications/unread-count", {}, token),
  markRead: (id, token) => api(`/ls/notifications/${id}/read`, { method: "POST" }, token),
  ticket: (token) => api("/ls/events/ticket", { method: "POST" }, token),
};

// Investigation cases
export const cases = {
  list: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return api(`/ls/cases${q ? `?${q}` : ""}`, {}, token);
  },
  get: (id, token) => api(`/ls/cases/${id}`, {}, token),
  create: (data, token) => api("/ls/cases", { method: "POST", body: JSON.stringify(data) }, token),
  resolve: (id, token) => api(`/ls/cases/${id}/resolve`, { method: "POST" }, token),
};

// Intelligence: health, monitoring, history, warnings, portfolio
export const intel = {
  health: (part, token) => api(`/api/health/${part}`, {}, token),
  monitoring: (token) => api("/api/ls/admin/model/monitoring", {}, token),
  riskHistory: (bid, token) => api(`/ls/borrowers/${bid}/risk-history`, {}, token),
  warnings: (token) => api("/ls/intel/warnings", {}, token),
  portfolio: (token) => api("/ls/intel/portfolio", {}, token),
};

// Copilot (deterministic analyst over live records)
export const copilot = {
  ask: (question, token) =>
    api("/ls/copilot/ask", { method: "POST", body: JSON.stringify({ question }) }, token),
};

// Simulation center
export const sim = {
  scenarios: (token) => api("/ls/admin/simulate/scenarios", {}, token),
  run: (scenario, token) =>
    api("/ls/admin/simulate/scenario", { method: "POST", body: JSON.stringify({ scenario }) }, token),
  cleanup: (token) => api("/ls/admin/simulate/cleanup", { method: "POST" }, token),
};

// Utility
export const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
