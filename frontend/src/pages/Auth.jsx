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
  const [step, setStep] = useState("phone");
  const [emailStep, setEmailStep] = useState("login"); // login|register|verify|forgot|reset
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pendingKind, setPendingKind] = useState("register"); // register|login
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [demoOtp, setDemoOtp] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const resetOtpBoxes = () => {
    setOtp(["", "", "", "", "", ""]);
    setDemoOtp(null);
  };

  // ---------- phone OTP (unchanged flow) ----------
  const handleSendOtp = async () => {
    if (!/^\d{10}$/.test(phone)) { setError("Enter a valid 10-digit mobile number"); return; }
    setError(""); setLoading(true);
    try {
      const r = await signIn("otp", { phone, name });
      if (r.demo_otp) setDemoOtp(r.demo_otp);
      setStep("otp");
      setTimer(45);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (!/^\d{6}$/.test(code)) { setError("Enter all 6 digits"); return; }
    setError(""); setLoading(true);
    try {
      await signIn("verify", { phone, otp: code, name });
      navigate("/dashboard");
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
        // New device: prove the inbox once, then straight in.
        setPendingKind("login");
        resetOtpBoxes();
        if (r.demo_otp) setDemoOtp(r.demo_otp);
        setEmailStep("verify");
        setTimer(45);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
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
      setPendingKind("register");
      resetOtpBoxes();
      if (r.demo_otp) setDemoOtp(r.demo_otp);
      setEmailStep("verify");
      setTimer(45);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleEmailVerify = async () => {
    const code = otp.join("");
    if (!/^\d{6}$/.test(code)) { setError("Enter all 6 digits"); return; }
    setError(""); setLoading(true);
    try {
      if (pendingKind === "login") {
        // verify-login returns the fresh profile and sets the session cookie
        await signIn("verify-login", { email: email.trim(), otp: code });
        navigate("/dashboard");
      } else {
        await signIn("verify-email", { email: email.trim(), otp: code });
        navigate("/dashboard");
      }
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
      setTimer(45);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleReset = async () => {
    const code = otp.join("");
    if (!/^\d{6}$/.test(code)) { setError("Enter all 6 digits"); return; }
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
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "Enter") {
      if (mode === "otp") handleVerify();
      else if (emailStep === "verify") handleEmailVerify();
      else if (emailStep === "reset") handleReset();
    }
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
          <button className={`auth-tab ${mode === "otp" ? "auth-tab-active" : ""}`} onClick={() => { setMode("otp"); setStep("phone"); setError(""); }}>Phone OTP</button>
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

        {mode === "email" && emailStep === "verify" && (
          <div className="auth-form fade-in">
            <p className="auth-otp-label">
              {pendingKind === "login" ? <>New device — code sent to <b>{email}</b></> : <>Code sent to <b>{email}</b> <button className="link-btn" onClick={() => setEmailStep("register")}>change</button></>}
            </p>
            {otpBoxes()}
            {error && <div className="auth-error">{error}</div>}
            {demoOtp && <div className="auth-demo-otp">Demo OTP · <b>{demoOtp}</b></div>}
            <Button variant="primary" className="auth-btn" onClick={handleEmailVerify} disabled={loading}>
              {loading ? "Verifying…" : pendingKind === "login" ? "Verify device & sign in" : "Verify & sign in"}
            </Button>
            <p className="auth-hint">One verification per device — future logins need just email + password.</p>
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

        {mode === "otp" && step === "phone" && (
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

        {mode === "otp" && step === "otp" && (
          <div className="auth-form fade-in">
            <p className="auth-otp-label">Code sent to <b>+91 {phone}</b> <button className="link-btn" onClick={() => setStep("phone")}>change</button></p>
            {otpBoxes()}
            {error && <div className="auth-error">{error}</div>}
            {demoOtp && <div className="auth-demo-otp">Demo OTP · <b>{demoOtp}</b></div>}
            <Button variant="primary" className="auth-btn" onClick={handleVerify} disabled={loading}>
              {loading ? "Verifying…" : "Verify & sign in"}
            </Button>
            <div className="auth-resend">
              {timer > 0 ? <span className="auth-timer">Resend in 0:{String(timer).padStart(2, "0")}</span> :
                <button className="link-btn" onClick={handleSendOtp}>Resend code</button>}
            </div>
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
