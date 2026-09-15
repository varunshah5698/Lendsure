import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import "./Auth.css";

export default function Auth() {
  const { session, loading: authLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("email");
  const [emailStep, setEmailStep] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [demoOtp, setDemoOtp] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [idleNotice, setIdleNotice] = useState(false);
  const [timer, setTimer] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (!authLoading && session) navigate("/dashboard", { replace: true });
    try {
      if (sessionStorage.getItem("ls_expired")) {
        setIdleNotice(true);
        sessionStorage.removeItem("ls_expired");
      }
    } catch {}
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const clearError = () => setError("");
  const resetOtp = () => { setOtp(["", "", "", "", "", ""]); setDemoOtp(null); };
  const switchMode = (next) => { setMode(next); setEmailStep("login"); clearError(); resetOtp(); };
  const otpCode = () => otp.join("");

  const handleEmailLogin = async () => {
    if (!email.includes("@")) { setError("Enter your email address"); return; }
    if (!password) { setError("Enter your password"); return; }
    clearError(); setLoading(true);
    try {
      const r = await signIn("email-login", { email: email.trim(), password });
      if (r?.otp_required) { setEmailStep("verify-login"); setTimer(60); resetOtp(); setTimeout(() => otpRefs.current[0]?.focus(), 100); }
      else navigate("/dashboard");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name.trim()) { setError("Enter your name"); return; }
    if (!email.includes("@")) { setError("Enter your email address"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    clearError(); setLoading(true);
    try {
      const r = await signIn("register", { name: name.trim(), email: email.trim(), password });
      setDemoOtp(r?.demo_otp || null); setEmailStep("verify-email"); setTimer(60); resetOtp();
      if (r?.demo_otp) setDemoOtp(r.demo_otp);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleVerifyEmail = async () => {
    if (!/^\d{6}$/.test(otpCode())) { setError("Enter all 6 digits"); return; }
    clearError(); setLoading(true);
    try { await signIn("verify-email", { email: email.trim(), otp: otpCode() }); navigate("/dashboard"); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleVerifyLogin = async () => {
    if (!/^\d{6}$/.test(otpCode())) { setError("Enter all 6 digits"); return; }
    clearError(); setLoading(true);
    try { await signIn("verify-login", { email: email.trim(), otp: otpCode() }); navigate("/dashboard"); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleForgot = async () => {
    if (!email.includes("@")) { setError("Enter your email address"); return; }
    clearError(); setLoading(true);
    try {
      const r = await signIn("forgot", { email: email.trim() });
      setDemoOtp(r?.demo_otp || null); setEmailStep("reset"); resetOtp();
      if (r?.demo_otp) setDemoOtp(r.demo_otp);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!/^\d{6}$/.test(otpCode())) { setError("Enter all 6 digits"); return; }
    if (newPassword.length < 8) { setError("New password must be at least 8 characters"); return; }
    clearError(); setLoading(true);
    try { await signIn("reset", { email: email.trim(), otp: otpCode(), new_password: newPassword }); setEmailStep("login"); setPassword(""); setNewPassword(""); resetOtp(); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handlePhoneOtp = async () => {
    if (!/^\d{10}$/.test(phone)) { setError("Enter a valid 10-digit mobile number"); return; }
    clearError(); setLoading(true);
    try { const r = await signIn("otp", { phone, name }); setDemoOtp(r?.demo_otp || null); setMode("phone-verify"); setTimer(45); resetOtp(); setTimeout(() => otpRefs.current[0]?.focus(), 100); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handlePhoneVerify = async () => {
    if (!/^\d{6}$/.test(otpCode())) { setError("Enter all 6 digits"); return; }
    clearError(); setLoading(true);
    try { await signIn("verify", { phone, otp: otpCode(), name }); navigate("/dashboard"); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleGuest = async () => {
    clearError(); setLoading(true);
    try { await signIn("guest", { name: name || "Guest Explorer" }); navigate("/dashboard"); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleOtpInput = (i, value) => {
    const d = value.replace(/\D/g, "").slice(0, 1); const next = [...otp]; next[i] = d; setOtp(next);
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleOtpKey = (i, e, submit) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "Enter") submit();
  };
  const otpBoxes = (submit) => <div className="otp-boxes">{otp.map((v, i) => <input key={i} ref={(el) => otpRefs.current[i] = el} maxLength={1} inputMode="numeric" value={v} onChange={(e) => handleOtpInput(i, e.target.value)} onKeyDown={(e) => handleOtpKey(i, e, submit)} className={`otp-input ${v ? "otp-filled" : ""}`} />)}</div>;

  const isEmailVerify = mode === "email" && ["verify-email", "verify-login", "reset"].includes(emailStep);
  const title = mode === "email" && emailStep === "register" ? "Create your LendSure account" : isEmailVerify ? "Check your inbox" : mode === "email" && emailStep === "forgot" ? "Reset your password" : "Welcome back to LendSure";
  const subtitle = mode === "email" && emailStep === "register" ? "Start making clearer lending decisions today." : isEmailVerify ? `We sent a 6-digit code to ${email}` : "A calmer way to make confident lending decisions.";

  return <div className="auth-page">
    <section className="auth-visual">
      <div className="auth-visual-top"><Logo size={34} /><span>LendSure</span><small>SECURE LENDING INTELLIGENCE</small></div>
      <div className="auth-visual-copy"><p className="auth-eyebrow">A clearer view. A better next move.</p><h1>Make every<br />lending decision<br /><em>visible.</em></h1><p>One calm workspace for risk, evidence, and action — built for teams who need to move with confidence.</p></div>
      <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-glow-dot dot-one" /><div className="auth-glow-dot dot-two" /><div className="auth-shield"><Logo size={34} /></div>
    </section>
    <section className="auth-panel">
      <div className="auth-panel-inner">
        <div className="auth-mobile-logo"><Logo size={30} /><b>LendSure</b></div>
        <p className="auth-kicker">LENDSURE / ACCESS</p><h2 className="auth-title">{title}</h2><p className="auth-subtitle">{subtitle}</p>
        {idleNotice && <div className="auth-notice">Signed out after 5 minutes of inactivity. Please sign in again.</div>}
        {!isEmailVerify && mode === "email" && emailStep !== "forgot" && <div className="auth-segment"><button className={emailStep === "login" ? "active" : ""} onClick={() => { setEmailStep("login"); clearError(); }}>Sign in</button><button className={emailStep === "register" ? "active" : ""} onClick={() => { setEmailStep("register"); clearError(); }}>Sign up</button></div>}
        {mode === "email" && emailStep === "login" && <div className="auth-form fade-in"><label className="auth-label">GMAIL ADDRESS</label><input type="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" /><label className="auth-label">PASSWORD</label><input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()} className="auth-input" />{error && <div className="auth-error">{error}</div>}<Button variant="primary" className="auth-btn" onClick={handleEmailLogin} disabled={loading}>{loading ? "Signing in…" : "Sign in  →"}</Button><div className="auth-links"><button onClick={() => { setEmailStep("forgot"); clearError(); }}>Forgot password?</button></div></div>}
        {mode === "email" && emailStep === "register" && <div className="auth-form fade-in"><label className="auth-label">USERNAME</label><input type="text" placeholder="e.g. Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} className="auth-input" /><label className="auth-label">GMAIL ADDRESS</label><input type="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" /><label className="auth-label">PASSWORD</label><input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" />{error && <div className="auth-error">{error}</div>}<Button variant="primary" className="auth-btn" onClick={handleRegister} disabled={loading}>{loading ? "Creating…" : "Create account  →"}</Button></div>}
        {mode === "email" && emailStep === "forgot" && <div className="auth-form fade-in"><label className="auth-label">GMAIL ADDRESS</label><input type="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" />{error && <div className="auth-error">{error}</div>}<Button variant="primary" className="auth-btn" onClick={handleForgot} disabled={loading}>{loading ? "Sending…" : "Send reset code  →"}</Button><button className="auth-back" onClick={() => { setEmailStep("login"); clearError(); }}>← Back to sign in</button></div>}
        {isEmailVerify && <div className="auth-form fade-in"><p className="auth-otp-label">Enter the code sent to <b>{email}</b></p>{otpBoxes(emailStep === "verify-email" ? handleVerifyEmail : emailStep === "verify-login" ? handleVerifyLogin : handleReset)}{emailStep === "reset" && <><label className="auth-label">NEW PASSWORD</label><input type="password" placeholder="Choose a new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="auth-input" /></>}{error && <div className="auth-error">{error}</div>}{demoOtp && <div className="auth-demo-otp">Demo OTP · <b>{demoOtp}</b></div>}<Button variant="primary" className="auth-btn" onClick={emailStep === "verify-email" ? handleVerifyEmail : emailStep === "verify-login" ? handleVerifyLogin : handleReset} disabled={loading}>{loading ? "Verifying…" : emailStep === "reset" ? "Update password  →" : "Verify & continue  →"}</Button>{timer > 0 && <span className="auth-timer">Resend available in 0:{String(timer).padStart(2, "0")}</span>}<button className="auth-back" onClick={() => { setEmailStep("login"); clearError(); }}>← Back to sign in</button></div>}
        {mode === "phone" && <div className="auth-form fade-in"><label className="auth-label">MOBILE NUMBER</label><input type="tel" placeholder="10-digit mobile" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} className="auth-input" />{error && <div className="auth-error">{error}</div>}<Button variant="primary" className="auth-btn" onClick={handlePhoneOtp} disabled={loading}>{loading ? "Sending…" : "Send OTP  →"}</Button><p className="auth-hint">We’ll send a 6-digit OTP by SMS. It expires in 5 minutes.</p></div>}
        {mode === "phone-verify" && <div className="auth-form fade-in"><p className="auth-otp-label">Code sent to <b>+91 {phone}</b></p>{otpBoxes(handlePhoneVerify)}{error && <div className="auth-error">{error}</div>}{demoOtp && <div className="auth-demo-otp">Demo OTP · <b>{demoOtp}</b></div>}<Button variant="primary" className="auth-btn" onClick={handlePhoneVerify} disabled={loading}>{loading ? "Verifying…" : "Verify & sign in"}</Button><button className="auth-back" onClick={() => { setMode("phone"); clearError(); }}>← Change number</button></div>}
        {mode === "guest" && <div className="auth-form fade-in"><label className="auth-label">DISPLAY NAME</label><input type="text" placeholder="Guest Explorer" value={name} onChange={(e) => setName(e.target.value)} className="auth-input" />{error && <div className="auth-error">{error}</div>}<Button variant="secondary" className="auth-btn" onClick={handleGuest} disabled={loading}>{loading ? "Entering…" : "Continue as guest  →"}</Button></div>}
        {!isEmailVerify && emailStep !== "forgot" && <><div className="auth-divider"><span>or use another access</span></div><div className="auth-alternatives"><button onClick={() => switchMode("phone")}>Phone OTP</button><button onClick={() => switchMode("guest")}>Continue as guest</button></div></>}
        <p className="auth-footer">Have a complaint? <Link to="/grievance">File it here</Link> · <Link to="/grievance/track">Track a ticket</Link></p>
      </div>
    </section>
  </div>;
}
