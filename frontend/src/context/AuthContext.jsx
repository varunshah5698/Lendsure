import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("ls_session");
    if (raw) {
      try {
        const s = JSON.parse(raw);
        auth.me(s.token)
          .then((me) => setSession({ token: s.token, ...me }))
          .catch(() => localStorage.removeItem("ls_session"))
          .finally(() => setLoading(false));
      } catch {
        localStorage.removeItem("ls_session");
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (method, data) => {
    let result;
    if (method === "otp") result = await auth.requestOtp(data.phone, data.name);
    else if (method === "verify") result = await auth.verifyOtp(data.phone, data.otp, data.name);
    else if (method === "guest") result = await auth.guest(data.name);
    else if (method === "register") result = await auth.register(data.name, data.email, data.password);
    else if (method === "verify-email") result = await auth.verifyEmail(data.email, data.otp);
    else if (method === "email-login") result = await auth.emailLogin(data.email, data.password);
    else if (method === "forgot") result = await auth.forgotPassword(data.email);
    else if (method === "reset") result = await auth.resetPassword(data.email, data.otp, data.new_password);
    else throw new Error("Unknown auth method");
    if (result.token) {
      const s = { token: result.token, display_name: result.display_name, phone: result.phone, role: result.role };
      localStorage.setItem("ls_session", JSON.stringify(s));
      setSession(s);
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    try { if (session) await auth.logout(session.token); } catch {}
    setSession(null);
    localStorage.removeItem("ls_session");
  }, [session]);

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Guests are read-only: governance mutations need a lender (phone OTP) session. */
export const isGuest = (session) => !session || session.role === "guest";

export function guardLender(session, toast) {
  if (isGuest(session)) {
    toast?.error?.("Guests are read-only — sign in with Phone OTP for lender actions");
    return false;
  }
  return true;
}
