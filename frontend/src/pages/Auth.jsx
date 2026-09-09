import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";
import "./Auth.css";

export default function Auth() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("otp");
  const [step, setStep] = useState("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
    setLoading(true);
    try {
      await signIn("guest", { name: name || "Guest" });
      navigate("/dashboard");
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
    if (e.key === "Enter") handleVerify();
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo size={38} />
          LendSure
        </div>

        <h2 className="auth-title">Sign in to your workspace</h2>
        <p className="auth-subtitle">Phone OTP or instant guest access</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "otp" ? "auth-tab-active" : ""}`} onClick={() => { setMode("otp"); setStep("phone"); }}>Phone OTP</button>
          <button className={`auth-tab ${mode === "guest" ? "auth-tab-active" : ""}`} onClick={() => setMode("guest")}>Guest</button>
        </div>

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
            <div className="otp-boxes">
              {otp.map((v, i) => (
                <input key={i} ref={(el) => otpRefs.current[i] = el} maxLength={1} value={v}
                  onChange={(e) => handleOtpInput(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKey(i, e)}
                  className={`otp-input ${v ? "otp-filled" : ""}`}
                />
              ))}
            </div>
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
      </div>
    </div>
  );
}
