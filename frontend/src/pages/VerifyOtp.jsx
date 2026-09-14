import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import "./Auth.css";

/** Dedicated one-time-code screen. The sign-in page sends users here after
 *  the password step (or phone-number step) instead of swapping its form.
 *  State: { kind: "phone"|"register"|"login", phone?, email?, name?, demoOtp? } */
export default function VerifyOtp() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const { kind, phone = "", email = "", name = "", demoOtp: initialDemo = null } = state;
  const N = Number.isInteger(state.otpLen) && state.otpLen >= 4 && state.otpLen <= 8 ? state.otpLen : 6;

  const [otp, setOtp] = useState(() => Array(N).fill(""));
  const [demoOtp, setDemoOtp] = useState(initialDemo);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(45);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  useEffect(() => {
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  }, []);

  const target = kind === "phone" ? (phone ? `+91 ${phone}` : "") : email;
  // Opened directly with no pending verification? Back to sign in.
  if (!kind || !target) return <Navigate to="/auth" replace />;

  const resetBoxes = () => {
    setOtp(Array(N).fill(""));
    setDemoOtp(null);
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (!new RegExp(`^\\d{${N}}$`).test(code)) { setError(`Enter all ${N} digits`); return; }
    setError(""); setLoading(true);
    try {
      if (kind === "phone") await signIn("verify", { phone, otp: code, name });
      else if (kind === "register") await signIn("verify-email", { email, otp: code });
      else await signIn("verify-login", { email, otp: code });
      navigate("/dashboard");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleResend = async () => {
    // Login-device codes re-issue from the sign-in form (needs the password),
    // so that kind links back instead of resending here.
    if (kind === "login") return;
    setError(""); setLoading(true);
    try {
      resetBoxes();
      let r;
      if (kind === "phone") r = await signIn("otp", { phone, name });
      else {
        const { auth } = await import("../lib/api");
        r = await auth.resendCode(email);
      }
      if (r && r.demo_otp) setDemoOtp(r.demo_otp);
      setTimer(45);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleInput = (i, val) => {
    const d = val.replace(/\D/g, "").slice(0, 1);
    const next = [...otp]; next[i] = d; setOtp(next);
    if (d && i < N - 1) otpRefs.current[i + 1]?.focus();
  };

  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "Enter") handleVerify();
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo size={38} />
          LendSure
        </div>

        <h2 className="auth-title">Enter verification code</h2>
        <p className="auth-subtitle">
          {kind === "login"
            ? "New device — we sent a code to your email"
            : `We sent a ${N}-digit code — enter it below`}
        </p>

        <div className="auth-form fade-in">
          <p className="auth-otp-label">Code sent to <b>{target}</b> <Link to="/auth" className="link-btn">change</Link></p>          <div className="otp-boxes">
            {otp.map((v, i) => (
              <input key={i} ref={(el) => otpRefs.current[i] = el} maxLength={1} value={v}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKey(i, e)}
                className={`otp-input ${v ? "otp-filled" : ""}`}
              />
            ))}
          </div>
          {error && <div className="auth-error">{error}</div>}
          {demoOtp && <div className="auth-demo-otp">Demo OTP · <b>{demoOtp}</b></div>}
          <Button variant="primary" className="auth-btn" onClick={handleVerify} disabled={loading}>
            {loading ? "Verifying…" : kind === "login" ? "Verify device & sign in" : "Verify & sign in"}
          </Button>
          <div className="auth-resend">
            {timer > 0 ? <span className="auth-timer">Resend in 0:{String(timer).padStart(2, "0")}</span> :
              kind === "login"
                ? <Link to="/auth" className="link-btn">Back to sign in to resend</Link>
                : <button className="link-btn" onClick={handleResend}>Resend code</button>}
          </div>
          <p className="auth-hint" style={{ textAlign: "center", marginTop: 10 }}>
            <Link to="/auth" className="link-btn">← Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
