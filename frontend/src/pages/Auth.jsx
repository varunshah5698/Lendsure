import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import "./Auth.css";

export default function Auth() {
  const { session, loading: authLoading, signIn } = useAuth();
  const navigate = useNavigate();
  // Already signed in (e.g. back from the landing page)? Skip the form.
  useEffect(() => {
    if (!authLoading && session) navigate("/dashboard", { replace: true });
  }, [authLoading, session, navigate]);
  // Idle-timeout kick lands here: explain why sign-in is needed again.
  const [idleNotice, setIdleNotice] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("ls_expired")) {
        setIdleNotice(true);
        sessionStorage.removeItem("ls_expired");
      }
    } catch {}
  }, []);

  const [mode, setMode] = useState("email");
  const [emailStep, setEmailStep] = useState("login"); // login|register|forgot|reset
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpLen, setOtpLen] = useState(6);
  const [otp, setOtp] = useState(() => Array(6).fill(""));

  useEffect(() => {
    let live = true;
    import("../lib/api").then(({ auth }) =>
      auth.otpConfig()
        .then((c) => {
          if (!live) return;
          const n = Number(c.otp_len) || 6;
          if (n >= 4 && n <= 8) { setOtpLen(n); setOtp(Array(n).fill("")); }
        })
        .catch(() => {}));
    return () => { live = false; };
  }, []);
  const [demoOtp, setDemoOtp] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef([]);

  const resetOtpBoxes = () => {
    setOtp(Array(otpLen).fill(""));
    setDemoOtp(null);
  };

  // ---------- phone OTP (unchanged flow) ----------
  const handleSendOtp = async () => {
    if (!/^\d{10}$/.test(phone)) { setError("Enter a valid 10-digit mobile number"); return; }
    setError(""); setLoading(true);
    try {
      const r = await signIn("otp", { phone, name });
      navigate("/verify-otp", { state: { kind: "phone", phone, name, demoOtp: r.demo_otp || null, otpLen: r.otp_len || 6 } });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleGuest = async () => {
    setError(""); setLoading(true);
    try {
      await signIn("guest", { name: name || "Guest" });
      navigate("/dashboard");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ---------- email + password (+ first-device OTP) ----------
  const handleEmailLogin = async () => {
    if (!email.includes("@")) { setError("Enter your email address"); return; }
    if (!password) { setError("Enter your password"); return; }
    setError(""); setLoading(true);
    try {
      const r = await signIn("email-login", { email: email.trim(), password });
      if (r && r.otp_required) {
        // New device: continue on the dedicated code page.
        navigate("/verify-otp", { state: { kind: "login", email: email.trim(), demoOtp: r.demo_otp || null, otpLen: r.otp_len || 6 } });
      } else {
        navigate("/dashboard");
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!email.includes("@")) { setError("Enter your email address"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError(""); setLoading(true);
    try {
      const r = await signIn("register", { name: name.trim(), email: email.trim(), password });
      navigate("/verify-otp", { state: { kind: "register", email: email.trim(), demoOtp: r.demo_otp || null, otpLen: r.otp_len || 6 } });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleForgot = async () => {
    if (!email.includes("@")) { setError("Enter your email address"); return; }
    setError(""); setLoading(true);
    try {
      const r = await signIn("forgot", { email: email.trim() });
      resetOtpBoxes();
      if (r.demo_otp) setDemoOtp(r.demo_otp);
      setEmailStep("reset");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleReset = async () => {
    const code = otp.join("");
    if (!new RegExp(`^\\d{${otpLen}}$`).test(code)) { setError(`Enter all ${otpLen} digits`); return; }
    if (newPassword.length < 8) { setError("New password must be at least 8 characters"); return; }
    setError(""); setLoading(true);
    try {
      await signIn("reset", { email: email.trim(), otp: code, new_password: newPassword });
      setEmailStep("login");
      setPassword("");
      setNewPassword("");
      resetOtpBoxes();
      setError("");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleOtpInput = (i, val) => {
    const d = val.replace(/\D/g, "").slice(0, 1);
    const next = [...otp]; next[i] = d; setOtp(next);
    if (d && i < otpLen - 1) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "Enter") handleReset();
  };

  const otpBoxes = (onEnter) => (
    <div className="otp-boxes">
      {otp.map((v, i) => (
        <input key={i} ref={(el) => otpRefs.current[i] = el} maxLength={1} value={v}
          onChange={(e) => handleOtpInput(i, e.target.value)}
          onKeyDown={(e) => handleOtpKey(i, e)}
          className={`otp-input ${v ? "otp-filled" : ""}`}
        />
      ))}
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo size={38} />
          LendSure
        </div>

        <h2 className="auth-title">Sign in to your workspace</h2>
        <p className="auth-subtitle">Email + password · Phone OTP · Guest access</p>
        {idleNotice && (
          <div className="auth-error" style={{ borderColor: "var(--warning)", color: "var(--text-secondary)" }}>
            Signed out after 5 minutes of inactivity. Please sign in again.
          </div>
        )}

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "email" ? "auth-tab-active" : ""}`} onClick={() => { setMode("email"); setEmailStep("login"); setError(""); }}>Email</button>
          <button className={`auth-tab ${mode === "otp" ? "auth-tab-active" : ""}`} onClick={() => { setMode("otp"); setError(""); }}>Phone OTP</button>
          <button className={`auth-tab ${mode === "guest" ? "auth-tab-active" : ""}`} onClick={() => { setMode("guest"); setError(""); }}>Guest</button>
        </div>

        {mode === "email" && emailStep === "login" && (
          <div className="auth-form fade-in">
            <label className="auth-label">Email address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" />
            <label className="auth-label">Password</label>
            <input type="password" placeholder="Your password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleEmailLogin(); }}
              className="auth-input" />
            {error && <div className="auth-error">{error}</div>}
            <Button variant="primary" className="auth-btn" onClick={handleEmailLogin} disabled={loading}>
              {loading ? "Signing in…" : "Sign in →"}
            </Button>
            <div className="auth-resend">
              <button className="link-btn" onClick={() => { setEmailStep("register"); setError(""); }}>Create account</button>
              <button className="link-btn" onClick={() => { setEmailStep("forgot"); setError(""); }}>Forgot password?</button>
            </div>
          </div>
        )}

        {mode === "email" && emailStep === "register" && (
          <div className="auth-form fade-in">
            <label className="auth-label">Display name</label>
            <input type="text" placeholder="e.g. Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} className="auth-input" />
            <label className="auth-label">Email address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" />
            <label className="auth-label">Password (min 8 characters)</label>
            <input type="password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" />
            {error && <div className="auth-error">{error}</div>}
            <Button variant="primary" className="auth-btn" onClick={handleRegister} disabled={loading}>
              {loading ? "Creating…" : "Create account →"}
            </Button>
            <div className="auth-resend">
              <button className="link-btn" onClick={() => { setEmailStep("login"); setError(""); }}>Back to sign in</button>
            </div>
          </div>
        )}

        {mode === "email" && emailStep === "forgot" && (
          <div className="auth-form fade-in">
            <label className="auth-label">Email address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" />
            {error && <div className="auth-error">{error}</div>}
            <Button variant="primary" className="auth-btn" onClick={handleForgot} disabled={loading}>
              {loading ? "Sending…" : "Send reset code →"}
            </Button>
            <div className="auth-resend">
              <button className="link-btn" onClick={() => { setEmailStep("login"); setError(""); }}>Back to sign in</button>
            </div>
          </div>
        )}

        {mode === "email" && emailStep === "reset" && (
          <div className="auth-form fade-in">
            <p className="auth-otp-label">Code sent to <b>{email}</b></p>
            {otpBoxes()}
            <label className="auth-label">New password (min 8 characters)</label>
            <input type="password" placeholder="Choose a new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="auth-input" />
            {error && <div className="auth-error">{error}</div>}
            {demoOtp && <div className="auth-demo-otp">Demo OTP · <b>{demoOtp}</b></div>}
            <Button variant="primary" className="auth-btn" onClick={handleReset} disabled={loading}>
              {loading ? "Updating…" : "Update password →"}
            </Button>
          </div>
        )}

        {mode === "otp" && (
          <div className="auth-form fade-in">
            <label className="auth-label">Display name <span className="auth-optional">(optional)</span></label>
            <input type="text" placeholder="e.g. Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} className="auth-input" />
            <label className="auth-label">Mobile number</label>
            <input type="tel" placeholder="10-digit mobile" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} className={`auth-input ${error ? "auth-input-error" : ""}`} />
            {error && <div className="auth-error">{error}</div>}
            <Button variant="primary" className="auth-btn" onClick={handleSendOtp} disabled={loading}>
              {loading ? "Sending…" : "Send OTP →"}
            </Button>
            <p className="auth-hint">Demo build — the OTP appears on screen, no SMS needed.</p>
          </div>
        )}

        {mode === "guest" && (
          <div className="auth-form fade-in">
            <label className="auth-label">Display name</label>
            <input type="text" value={name || "Guest Explorer"} onChange={(e) => setName(e.target.value)} className="auth-input" />
            {error && <div className="auth-error">{error}</div>}
            <Button variant="secondary" className="auth-btn" onClick={handleGuest} disabled={loading}>
              {loading ? "Entering…" : "Continue as Guest →"}
            </Button>
            <p className="auth-hint">Guest sessions last 24 hours and are labelled in the audit trail.</p>
          </div>
        )}
        <p className="auth-hint" style={{ textAlign: "center", marginTop: 14 }}>
          Have a complaint? <Link to="/grievance" className="link-btn">File it here</Link> · <Link to="/grievance/track" className="link-btn">Track a ticket</Link>
        </p>
      </div>
    </div>
  );
}
