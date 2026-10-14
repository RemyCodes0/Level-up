"use client";

import type React from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Lock, ArrowRight, ArrowLeft, AlertCircle, Eye, EyeOff, Check, X, KeyRound, Loader2, Link2Off } from "lucide-react";
import { isPasswordAcceptable } from "../lib/passwordStrength";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes rp-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes rp-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes rp-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
@keyframes rp-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
@keyframes rp-ring { 0% { transform: scale(.9); opacity: .7; } 100% { transform: scale(1.8); opacity: 0; } }
.rp-rise { animation: rp-rise .6s cubic-bezier(.2,.7,.2,1) both; }
.rp-shake { animation: rp-shake .4s ease; }
.rp-pop { animation: rp-pop .6s cubic-bezier(.2,.7,.2,1) both; }
.rp-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.rp-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.rp-input:-webkit-autofill, .rp-input:-webkit-autofill:hover, .rp-input:-webkit-autofill:focus {
  -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0 1000px #0E1016 inset; caret-color: #fff; transition: background-color 9999s;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

const INPUT = "rp-input h-12 w-full rounded-xl bg-[#0E1016] pl-11 text-[15px] text-white ring-1 transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-2";

// Visual guidance only — the actual gate is isPasswordAcceptable() from the
// shared lib, so the meter can never let through something the rule rejects.
const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "8+ characters", test: (p) => p.length >= 8 },
  { label: "Upper & lowercase", test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: "A number", test: (p) => /\d/.test(p) },
  { label: "A symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const passed = RULES.filter((r) => r.test(password)).length;
  const acceptable = isPasswordAcceptable(password);
  const level = acceptable ? Math.max(passed, 3) : Math.min(passed, 2);
  const tone = level >= 4 ? "#3DDC97" : level === 3 ? "#8B7CFF" : level === 2 ? "#FFB547" : "#FF5C6C";
  const label = acceptable ? (level >= 4 ? "Strong" : "Good enough") : level === 2 ? "Almost there" : "Too weak";

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1 flex-1 rounded-full transition-all duration-500" style={{ background: i < level ? tone : "rgba(255,255,255,0.07)" }} />
        ))}
        <span className="ml-2 w-24 text-right text-[11px] font-medium" style={{ color: tone }}>{label}</span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.label} className={cx("flex items-center gap-1.5 text-[12px] transition-colors", ok ? "text-[#B9BCCB]" : "text-[#555A6E]")}>
              <span className={cx("flex h-3.5 w-3.5 items-center justify-center rounded-full transition-all", ok ? "bg-[#3DDC97]/20" : "bg-white/[0.05]")}>
                {ok && <Check className="h-2.5 w-2.5 text-[#3DDC97]" strokeWidth={3} />}
              </span>
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <Helmet>
        <title>Reset password — Level Up AI</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-56 left-1/2 h-[560px] w-[760px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)" }} />
        <div className="absolute -bottom-40 -right-32 h-[420px] w-[520px] rounded-full opacity-[0.15] blur-[120px]" style={{ background: "radial-gradient(closest-side, #FF7A45, transparent)" }} />
        <div className="rp-grain absolute inset-0 opacity-60" />
      </div>
      <header className="relative flex h-16 items-center px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="h-8 w-8 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
            <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
          </span>
          <span className="rp-serif text-xl text-white">Level Up</span>
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-16 pt-6">{children}</main>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.background = "#0A0B10";
    document.body.style.minHeight = "100dvh";
    // No background reset on cleanup (deliberate) — see Login.tsx's own
    // comment on the identical effect for why.
    return () => {
      document.body.style.minHeight = "";
    };
  }, []);

  const fail = (msg: string) => { setError(msg); setShakeKey((k) => k + 1); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isPasswordAcceptable(password)) {
      fail("Please choose a stronger password before continuing.");
      return;
    }
    if (password !== confirmPassword) {
      fail("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/auth/reset-password`, { token, password });
      setDone(true);
    } catch (err: any) {
      fail(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // No token at all — a malformed or truncated link (an expired token is
  // reported by the API instead, via the error box below).
  if (!token) {
    return (
      <AuthShell>
        <div className="rp-rise w-full max-w-[400px] text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF5C6C]/10 ring-1 ring-[#FF5C6C]/30">
            <Link2Off className="h-6 w-6 text-[#FF5C6C]" />
          </div>
          <h1 className="rp-serif text-[44px] leading-[1.02] text-white">This link is broken</h1>
          <p className="mx-auto mt-3 max-w-xs text-[15px] text-[#8A8FA3]">It's missing its reset token — it may have been cut off when copied. Request a fresh one below.</p>
          <Link to="/forgot-password" className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-colors hover:bg-[#A093FF]">
            Request a new link <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-[#8A8FA3] transition-colors hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to login
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div className="w-full max-w-[400px] text-center">
          <div className="rp-pop relative mx-auto mb-7 flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-2xl bg-[#3DDC97]/25" style={{ animation: "rp-ring 1.6s ease-out infinite" }} />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[#3DDC97]/15 ring-1 ring-[#3DDC97]/40">
              <Check className="h-7 w-7 text-[#3DDC97]" strokeWidth={3} />
            </span>
          </div>
          <h1 className="rp-rise rp-serif text-[48px] leading-[1.02] text-white">You're all set.</h1>
          <p className="rp-rise mt-3 text-[15px] text-[#8A8FA3]" style={{ animationDelay: "60ms" }}>Your password has been reset. Sign in with your new one.</p>
          <button
            onClick={() => navigate("/login")}
            className="rp-rise group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-colors hover:bg-[#A093FF]"
            style={{ animationDelay: "120ms" }}
          >
            Go to login <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </AuthShell>
    );
  }

  const confirmTouched = confirmPassword.length > 0;
  const matches = confirmTouched && password === confirmPassword;

  return (
    <AuthShell>
      <div className="rp-rise w-full max-w-[400px]">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8B7CFF]/12 ring-1 ring-[#8B7CFF]/30">
          <KeyRound className="h-5 w-5 text-[#B4A9FF]" />
        </div>
        <h1 className="rp-serif text-[44px] leading-[1.02] text-white sm:text-[52px]">Choose a new password</h1>
        <p className="mt-2 text-[15px] text-[#8A8FA3]">Make it one you haven't used before.</p>

        <form onSubmit={handleSubmit} className="mt-8">
          {error && (
            <p key={shakeKey} role="alert" className="rp-shake mb-5 flex items-start gap-2 rounded-xl bg-[#FF5C6C]/[0.08] p-3.5 text-sm text-[#FF8A95] ring-1 ring-[#FF5C6C]/25">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">New password</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                  required
                  minLength={8}
                  autoFocus
                  className={cx(INPUT, "pr-12 ring-white/[0.1] focus:ring-[#8B7CFF]/70")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-white/[0.06] hover:text-white"
                  aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <StrengthMeter password={password} />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">Confirm password</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(""); }}
                  required
                  className={cx(
                    INPUT, "pr-12",
                    !confirmTouched ? "ring-white/[0.1] focus:ring-[#8B7CFF]/70" : matches ? "ring-[#3DDC97]/50 focus:ring-[#3DDC97]/60" : "ring-[#FF5C6C]/40 focus:ring-[#FF5C6C]/50"
                  )}
                />
                {confirmTouched && (
                  <span className={cx("absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full", matches ? "bg-[#3DDC97]/15" : "bg-[#FF5C6C]/15")}>
                    {matches ? <Check className="h-3.5 w-3.5 text-[#3DDC97]" strokeWidth={3} /> : <X className="h-3.5 w-3.5 text-[#FF5C6C]" strokeWidth={3} />}
                  </span>
                )}
              </div>
              {confirmTouched && !matches && confirmPassword.length >= Math.min(password.length, 3) && (
                <p className="mt-2 text-[12px] text-[#FF8A95]">Passwords don't match yet.</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-all hover:bg-[#A093FF] disabled:opacity-70"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Resetting…</> : <>Reset password <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
          </button>

          <Link to="/login" className="mx-auto mt-6 flex w-fit items-center gap-1.5 text-[13px] text-[#8A8FA3] transition-colors hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to login
          </Link>
        </form>
      </div>
    </AuthShell>
  );
}