"use client";

import type React from "react";
import axios from "axios";
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { analytics, identifyUser } from "../lib/analytics";
import { isPasswordAcceptable } from "../lib/passwordStrength";
import {
  Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff, User, CheckCircle2, Loader2, Check, Gift, Zap,
  Film, Target, Users, RotateCcw, Clock,
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const RESEND_COOLDOWN_S = 60;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes su-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes su-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes su-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
@keyframes su-ring { 0% { transform: scale(.9); opacity: .6; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes su-count { from { opacity: 0; transform: translateY(10px) scale(.9); } to { opacity: 1; transform: none; } }
@keyframes su-coin { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-10px) rotate(6deg); } }
.su-rise { animation: su-rise .6s cubic-bezier(.2,.7,.2,1) both; }
.su-shake { animation: su-shake .4s ease; }
.su-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.su-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.su-input:-webkit-autofill, .su-input:-webkit-autofill:hover, .su-input:-webkit-autofill:focus {
  -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0 1000px #0E1016 inset; caret-color: #fff; transition: background-color 9999s;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

const INPUT = "su-input h-12 w-full rounded-xl bg-[#0E1016] pl-11 text-[15px] text-white ring-1 ring-white/[0.1] transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-2 focus:ring-[#8B7CFF]/70";
const PRIMARY = "group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-all hover:bg-[#A093FF] disabled:opacity-70";

// Visual guidance only — isPasswordAcceptable() is the real gate.
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
              <span className={cx("flex h-3.5 w-3.5 items-center justify-center rounded-full", ok ? "bg-[#3DDC97]/20" : "bg-white/[0.05]")}>
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

function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
    </span>
  );
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verified, setVerified] = useState(false); // shows "check your email" screen
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const router = useNavigate();

  // Referral code from the invite link (?ref=abc123)
  const refCode = new URLSearchParams(window.location.search).get("ref") || "";
  // Topic typed on the landing page, waiting to be generated after signup
  const [pendingTopic] = useState(() => localStorage.getItem("levelup_pending_prompt"));

  const googleWrapRef = useRef<HTMLDivElement>(null);
  const [googleWidth, setGoogleWidth] = useState(360);
  useEffect(() => {
    const el = googleWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setGoogleWidth(Math.min(400, Math.max(200, Math.floor(entry.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [verified]);

  useEffect(() => {
    document.body.style.background = "#0A0B10";
    document.body.style.minHeight = "100dvh";
    // No background reset on cleanup (deliberate) — see Login.tsx's own
    // comment on the identical effect for why.
    return () => {
      document.body.style.minHeight = "";
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (msg: string) => { setError(msg); setShakeKey((k) => k + 1); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isPasswordAcceptable(password)) {
      fail("Please choose a stronger password before continuing.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/register`, {
        name: fullName,
        email,
        password,
        ...(refCode ? { ref: refCode } : {}),
      });

      if (res.data.requiresVerification) {
        analytics.signedUp({ requires_verification: true });
        setVerified(true);
        setCooldown(RESEND_COOLDOWN_S);
      } else {
        // Backwards-compat: backend returned a token directly
        const { token, ...user } = res.data;
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
        identifyUser(user);
        analytics.signedUp({ requires_verification: false });
        router("/ai_tutor");
      }
    } catch (err: any) {
      fail(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setResendMsg("");
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/resend-verification`, { email });
      setResendMsg(res.data.message || "Verification email resent!");
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setResendMsg("Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  // Google signup skips email verification — Google has already verified the
  // address, so /api/auth/google returns a real token immediately.
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/google`, { credential: credentialResponse.credential });
      const { token, ...user } = res.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      identifyUser(user);
      analytics.signedUp({ requires_verification: false });
      router("/ai_tutor");
    } catch (err: any) {
      fail(err.response?.data?.message || "Google Sign-In failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div
      className="relative flex min-h-[100dvh] w-full bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <Helmet>
        <title>Create your account — Level Up AI</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>
      {children}
    </div>
  );

  // ── "Check your email" ────────────────────────────────────────────────────
  if (verified) {
    return shell(
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-56 left-1/2 h-[560px] w-[760px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "su-aurora 18s ease-in-out infinite" }} />
          <div className="su-grain absolute inset-0 opacity-60" />
        </div>
        <header className="relative flex h-16 items-center px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5"><Logo /><span className="su-serif text-xl text-white">Level Up</span></Link>
        </header>
        <div className="relative flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-[420px] text-center">
            <div className="su-rise relative mx-auto mb-8 flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-2xl bg-[#8B7CFF]/25" style={{ animation: "su-ring 1.8s ease-out infinite" }} />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[#8B7CFF]/15 ring-1 ring-[#8B7CFF]/40">
                <Mail className="h-7 w-7 text-[#B4A9FF]" />
              </span>
            </div>
            <h1 className="su-rise su-serif text-[48px] leading-[1.02] text-white">One last step.</h1>
            <p className="su-rise mt-4 text-[15px] text-[#8A8FA3]" style={{ animationDelay: "60ms" }}>We sent a verification link to</p>
            <p className="su-rise mx-auto mt-1.5 w-fit max-w-full truncate rounded-lg bg-white/[0.05] px-3 py-1.5 text-[15px] font-medium text-white ring-1 ring-white/[0.08]" style={{ animationDelay: "90ms" }}>{email}</p>
            <p className="su-rise mt-4 text-[14px] leading-relaxed text-[#8A8FA3]" style={{ animationDelay: "120ms" }}>
              Click it to verify your account, then log in — your <span className="font-semibold text-white">100 free credits</span> will be waiting.
            </p>
            <p className="su-rise mt-3 inline-flex items-center gap-1.5 text-[12px] text-[#6E7389]" style={{ animationDelay: "150ms" }}>
              <Clock className="h-3.5 w-3.5" /> Link expires in 24 hours · check spam too
            </p>

            {refCode && (
              <p className="su-rise mx-auto mt-5 flex w-fit items-center gap-1.5 rounded-full bg-[#FFB547]/[0.08] px-3 py-1.5 text-[12px] text-[#FFD08A] ring-1 ring-[#FFB547]/25" style={{ animationDelay: "180ms" }}>
                <Gift className="h-3.5 w-3.5" /> Verifying also credits the friend who invited you
              </p>
            )}

            <button onClick={() => router("/login")} className={cx(PRIMARY, "su-rise mt-8")} style={{ animationDelay: "220ms" }}>
              Go to login <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>

            <div className="su-rise mt-8 border-t border-white/[0.06] pt-6 text-[13px] text-[#6E7389]" style={{ animationDelay: "260ms" }}>
              Didn't get it?{" "}
              <button
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="inline-flex items-center gap-1 font-medium text-white underline-offset-4 hover:underline disabled:cursor-default disabled:text-[#555A6E] disabled:no-underline"
              >
                {resending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resending…</> : cooldown > 0 ? `Resend in ${cooldown}s` : <><RotateCcw className="h-3.5 w-3.5" /> Resend verification email</>}
              </button>
              {resendMsg && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-[#7BE8B8]"><CheckCircle2 className="h-3.5 w-3.5" /> {resendMsg}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Signup form ───────────────────────────────────────────────────────────
  return shell(
    <>
      {/* Offer panel (desktop) */}
      <aside className="relative hidden w-[46%] max-w-[680px] shrink-0 overflow-hidden border-r border-white/[0.06] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[620px] w-[620px] rounded-full opacity-40 blur-[120px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "su-aurora 18s ease-in-out infinite" }} />
          <div className="absolute -bottom-40 right-[-120px] h-[460px] w-[460px] rounded-full opacity-25 blur-[120px]" style={{ background: "radial-gradient(closest-side, #FFB547, transparent)", animation: "su-aurora 22s ease-in-out infinite reverse" }} />
          <div className="su-grain absolute inset-0 opacity-60" />
        </div>

        <Link to="/" className="relative z-10 flex items-center gap-2.5 p-10"><Logo /><span className="su-serif text-[22px] text-white">Level Up</span></Link>

        <div className="relative z-10 flex flex-1 flex-col justify-center px-10 pb-12 xl:px-14">
          <div className="su-rise flex items-end gap-4">
            <span className="su-serif text-[120px] leading-[0.8] text-white xl:text-[150px]" style={{ animation: "su-count .9s cubic-bezier(.2,.7,.2,1) both" }}>100</span>
            <div className="pb-3">
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#FFB547] to-[#FF7A45] shadow-[0_0_30px_-4px_rgba(255,181,71,0.8)]" style={{ animation: "su-coin 4s ease-in-out infinite" }}>
                <Zap className="h-5 w-5 fill-[#2A1A00] text-[#2A1A00]" />
              </span>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#FFD08A]">free credits</p>
            </div>
          </div>
          <h2 className="su-rise su-serif mt-6 max-w-md text-[44px] leading-[1.02] text-white xl:text-[52px]" style={{ animationDelay: "80ms" }}>
            Your first course is <span className="italic bg-gradient-to-r from-[#C3BAFF] via-[#8B7CFF] to-[#FF7A45] bg-clip-text text-transparent">on us.</span>
          </h2>
          <p className="su-rise mt-4 max-w-sm text-[15px] text-[#8A8FA3]" style={{ animationDelay: "140ms" }}>No card, no subscription. Create an account and start learning in minutes.</p>

          <ul className="su-rise mt-10 max-w-md space-y-4" style={{ animationDelay: "200ms" }}>
            {[
              { icon: Film, color: "#B4A9FF", t: "Animated, narrated lessons", d: "Built from any topic, PDF or slides." },
              { icon: Target, color: "#3DDC97", t: "A readiness quiz", d: "Scored topic by topic, with every miss explained." },
              { icon: Users, color: "#FFB547", t: "Study groups & sharing", d: "Learn with friends — or share any course by link." },
            ].map(({ icon: I, color, t, d }) => (
              <li key={t} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1" style={{ background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}40` }}>
                  <I className="h-4 w-4" style={{ color }} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{t}</span>
                  <span className="block text-[13px] text-[#8A8FA3]">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form column */}
      <main className="relative flex flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden" aria-hidden="true">
          <div className="absolute -top-48 left-1/2 h-[480px] w-[640px] -translate-x-1/2 rounded-full opacity-30 blur-[110px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "su-aurora 18s ease-in-out infinite" }} />
          <div className="su-grain absolute inset-0 opacity-60" />
        </div>

        <header className="relative flex h-16 items-center justify-between px-5 sm:px-8 lg:justify-end">
          <Link to="/" className="flex items-center gap-2.5 lg:hidden"><Logo /><span className="su-serif text-xl text-white">Level Up</span></Link>
          <p className="text-[13px] text-[#8A8FA3]">
            Have an account? <Link to="/login" className="font-medium text-white underline-offset-4 hover:underline">Log in</Link>
          </p>
        </header>

        <div className="relative flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="su-rise w-full max-w-[400px]">
            {refCode && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl bg-[#FFB547]/[0.07] p-3.5 ring-1 ring-[#FFB547]/25">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFB547]/15"><Gift className="h-4 w-4 text-[#FFB547]" /></span>
                <p className="text-[13px] leading-snug text-[#E8C890]"><span className="font-semibold text-white">A friend invited you.</span> Sign up and verify your email — you'll both win.</p>
              </div>
            )}

            <h1 className="su-serif text-[44px] leading-[1.02] text-white sm:text-[52px]">Join Level Up</h1>
            <p className="mt-2 text-[15px] text-[#8A8FA3]">
              <span className="lg:hidden"><span className="font-semibold text-[#FFD08A]">100 free credits</span> · </span>
              Create your account and start learning today.
            </p>
            {pendingTopic && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] text-[#B9BCCB] ring-1 ring-white/[0.08]">
                <Film className="h-4 w-4 shrink-0 text-[#B4A9FF]" />
                <span className="min-w-0 truncate">Up next: <span className="text-white">“{pendingTopic}”</span></span>
              </p>
            )}

            <div ref={googleWrapRef} className="mt-7 flex min-h-[44px] justify-center overflow-hidden rounded-full">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => fail("Google Sign-In failed. Please try again.")}
                theme="filled_black"
                shape="pill"
                size="large"
                text="signup_with"
                width={String(googleWidth)}
              />
            </div>

            <div className="my-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[#3E4253]">
              <span className="h-px flex-1 bg-white/[0.07]" /> or with email <span className="h-px flex-1 bg-white/[0.07]" />
            </div>

            <form onSubmit={handleSubmit}>
              {error && (
                <p key={shakeKey} role="alert" className="su-shake mb-5 flex items-start gap-2 rounded-xl bg-[#FF5C6C]/[0.08] p-3.5 text-sm text-[#FF8A95] ring-1 ring-[#FF5C6C]/25">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="fullName" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">Full name</label>
                  <div className="group relative">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                    <input id="fullName" type="text" autoComplete="name" placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required className={cx(INPUT, "pr-4")} />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">Email</label>
                  <div className="group relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                    <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={cx(INPUT, "pr-4")} />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">Password</label>
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
                      className={cx(INPUT, "pr-12")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-white/[0.06] hover:text-white"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <StrengthMeter password={password} />
                </div>
              </div>

              <button type="submit" disabled={loading} className={cx(PRIMARY, "mt-7")}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</> : <>Create account <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
              </button>

              <p className="mt-5 text-center text-[12px] leading-relaxed text-[#6E7389]">
                By creating an account, you agree to our{" "}
                <a href="/terms.html" className="text-[#B9BCCB] underline-offset-4 hover:text-white hover:underline">Terms of Service</a> and{" "}
                <a href="/privacy-policy.html" className="text-[#B9BCCB] underline-offset-4 hover:text-white hover:underline">Privacy Policy</a>.
              </p>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}