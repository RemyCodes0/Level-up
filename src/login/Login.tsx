"use client";

import type React from "react";
import axios from "axios";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { analytics, identifyUser } from "../lib/analytics";
import {
  Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff, Loader2, CheckCircle2, Play, Film, Target, Users, ArrowUpFromLine,
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes au-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes au-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes au-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
@keyframes au-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes au-wave { 0%,100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }
.au-rise { animation: au-rise .6s cubic-bezier(.2,.7,.2,1) both; }
.au-shake { animation: au-shake .4s ease; }
.au-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.au-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.au-input:-webkit-autofill, .au-input:-webkit-autofill:hover, .au-input:-webkit-autofill:focus {
  -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0 1000px #0E1016 inset; caret-color: #fff; transition: background-color 9999s;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

// Only same-site relative paths are honoured as a post-login destination —
// never an absolute or protocol-relative URL (open-redirect guard).
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  // Google's button needs an explicit pixel width; track the column's width.
  const googleWrapRef = useRef<HTMLDivElement>(null);
  const [googleWidth, setGoogleWidth] = useState(360);
  useEffect(() => {
    const el = googleWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setGoogleWidth(Math.min(400, Math.max(200, Math.floor(entry.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.background = "#0A0B10";
    document.body.style.minHeight = "100dvh";
    // No background reset on cleanup (deliberate) — resetting to "" falls
    // back to index.css's light default for however long it takes the NEXT
    // page's own effect to set its color, flashing white between any two
    // pages that use this pattern. Leaving the color in place until the
    // next page overwrites it removes that gap entirely — see the sibling
    // effect in Signup.tsx/ForgotPassword.tsx/ResetPassword.tsx for the same
    // fix, same reasoning.
    return () => {
      document.body.style.minHeight = "";
    };
  }, []);

  const fail = (msg: string) => { setError(msg); setShakeKey((k) => k + 1); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setResendMsg("");
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/login`, { email, password });
      applyLoginResponse(res.data);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.needsVerification) {
        setNeedsVerification(true);
        setError("Please verify your email before logging in.");
      } else {
        setNeedsVerification(false);
        fail(data?.message || "Invalid email or password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Shared by email/password and Google — both endpoints return
  // { _id, name, email, role, token }.
  const applyLoginResponse = (data: { _id: string; name: string; email: string; role: string; token: string }) => {
    localStorage.setItem("token", data.token);
    const loggedInUser = { _id: data._id, name: data.name, email: data.email, role: data.role };
    localStorage.setItem("user", JSON.stringify(loggedInUser));
    identifyUser(loggedInUser);
    analytics.loggedIn({ role: data.role });
    navigate(next ?? "/ai_tutor");
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setError("");
    setNeedsVerification(false);
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/google`, { credential: credentialResponse.credential });
      applyLoginResponse(res.data);
    } catch (err: any) {
      fail(err.response?.data?.message || "Google Sign-In failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMsg("");
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/resend-verification`, { email });
      setResendMsg(res.data.message || "Verification email resent!");
    } catch {
      setResendMsg("Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const onPasswordKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  return (
    <div
      className="relative flex min-h-[100dvh] w-full bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <Helmet>
        <title>Log in — Level Up AI</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>

      {/* ── Brand panel (desktop) ── */}
      <aside className="relative hidden w-[46%] max-w-[680px] shrink-0 overflow-hidden border-r border-white/[0.06] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[620px] w-[620px] rounded-full opacity-40 blur-[120px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)" }} />
          <div className="absolute -bottom-40 right-[-120px] h-[460px] w-[460px] rounded-full opacity-25 blur-[120px]" style={{ background: "radial-gradient(closest-side, #FF7A45, transparent)" }} />
          <div className="au-grain absolute inset-0 opacity-60" />
        </div>

        <Link to="/" className="relative z-10 flex items-center gap-2.5 p-10">
          <span className="h-8 w-8 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
            <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
          </span>
          <span className="au-serif text-[22px] text-white">Level Up</span>
        </Link>

        <div className="relative z-10 flex flex-1 flex-col justify-center px-10 pb-10 xl:px-14">
          <h2 className="au-rise au-serif text-[56px] leading-[1] text-white xl:text-[68px]">
            Pick up where<br />you <span className="italic bg-gradient-to-r from-[#C3BAFF] via-[#8B7CFF] to-[#FF7A45] bg-clip-text text-transparent">left off.</span>
          </h2>
          <p className="au-rise mt-5 max-w-sm text-[15px] leading-relaxed text-[#8A8FA3]" style={{ animationDelay: "80ms" }}>
            Your courses, quiz scores and study groups are waiting — exactly where you left them.
          </p>

          {/* "Continue watching" mock */}
          <div className="au-rise relative mt-12 max-w-md" style={{ animationDelay: "160ms" }}>
            <div className="overflow-hidden rounded-2xl bg-[#11131A]/90 ring-1 ring-white/[0.1] shadow-[0_40px_80px_-30px_rgba(0,0,0,1)] backdrop-blur" style={{ animation: "au-float 7s ease-in-out infinite" }}>
              <div className="relative aspect-[16/8] overflow-hidden bg-[#07080C]">
                <svg viewBox="0 0 400 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <circle key={i} cx="290" cy="100" r={24 + i * 24} fill="none" stroke={i % 2 ? "#8B7CFF" : "#3DDC97"} strokeOpacity={0.45 - i * 0.08} strokeDasharray="3 6">
                      <animateTransform attributeName="transform" type="rotate" from="0 290 100" to={`${i % 2 ? -360 : 360} 290 100`} dur={`${16 + i * 5}s`} repeatCount="indefinite" />
                    </circle>
                  ))}
                  <circle cx="290" cy="100" r="14" fill="#8B7CFF" fillOpacity=".7" />
                  <text x="22" y="34" fill="#6E7389" fontFamily="Geist, sans-serif" fontSize="9" letterSpacing="2">LESSON 03 / 06</text>
                  <text x="22" y="62" fill="#fff" fontFamily="Instrument Serif, serif" fontSize="24">Memory cells</text>
                </svg>
                <span className="absolute bottom-3 left-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0A0B10] shadow-lg">
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                </span>
              </div>
              <div className="h-1 bg-white/[0.06]"><div className="h-full w-[62%] bg-[#8B7CFF]" /></div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">Continue watching</p>
                  <p className="mt-0.5 text-sm text-white">How vaccines work</p>
                </div>
                <div className="flex h-5 items-center gap-[2px]">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span key={i} className="h-full w-[2px] rounded-full bg-[#B4A9FF]" style={{ animation: "au-wave 1.1s ease-in-out infinite", animationDelay: `${(i % 5) * 0.1}s` }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -right-6 -top-6 rounded-xl bg-[#11131A]/95 px-3 py-2 shadow-2xl ring-1 ring-white/10 backdrop-blur" style={{ animation: "au-float 6s ease-in-out .6s infinite" }}>
              <p className="flex items-center gap-1.5 text-xs text-white"><Target className="h-3.5 w-3.5 text-[#3DDC97]" /> Readiness <span className="font-semibold text-[#3DDC97]">86%</span></p>
            </div>
          </div>

          <div className="au-rise mt-14 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#6E7389]" style={{ animationDelay: "240ms" }}>
            <span className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5" /> Animated lessons</span>
            <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Readiness quizzes</span>
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Study groups</span>
          </div>
        </div>
      </aside>

      {/* ── Form ── */}
      <main className="relative flex flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden" aria-hidden="true">
          <div className="absolute -top-48 left-1/2 h-[480px] w-[640px] -translate-x-1/2 rounded-full opacity-30 blur-[110px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)" }} />
          <div className="au-grain absolute inset-0 opacity-60" />
        </div>

        <header className="relative flex h-16 items-center justify-between px-5 sm:px-8 lg:justify-end">
          <Link to="/" className="flex items-center gap-2.5 lg:hidden">
            <span className="h-8 w-8 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
              <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
            </span>
            <span className="au-serif text-xl text-white">Level Up</span>
          </Link>
          <p className="text-[13px] text-[#8A8FA3]">
            New here?{" "}
            <Link to="/signup" className="font-medium text-white underline-offset-4 hover:underline">Create an account</Link>
          </p>
        </header>

        <div className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="au-rise w-full max-w-[400px]">
            <h1 className="au-serif text-[44px] leading-[1.02] text-white sm:text-[52px]">Welcome back</h1>
            <p className="mt-2 text-[15px] text-[#8A8FA3]">
              {next ? "Sign in to continue where you were headed." : "Sign in to your Level Up account."}
            </p>

            {/* Google first — the fastest path for most people */}
            <div ref={googleWrapRef} className="mt-8 flex min-h-[44px] justify-center overflow-hidden rounded-full">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => fail("Google Sign-In failed. Please try again.")}
                theme="filled_black"
                shape="pill"
                size="large"
                text="continue_with"
                width={String(googleWidth)}
              />
            </div>

            <div className="my-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[#3E4253]">
              <span className="h-px flex-1 bg-white/[0.07]" /> or with email <span className="h-px flex-1 bg-white/[0.07]" />
            </div>

            <form onSubmit={handleSubmit} noValidate={false}>
              {error && (
                <div
                  key={shakeKey}
                  role="alert"
                  className={cx(
                    "mb-5 rounded-xl p-3.5 ring-1",
                    needsVerification ? "bg-[#FFB547]/[0.07] ring-[#FFB547]/25" : "au-shake bg-[#FF5C6C]/[0.08] ring-[#FF5C6C]/25"
                  )}
                >
                  <p className={cx("flex items-start gap-2 text-sm", needsVerification ? "text-[#FFD08A]" : "text-[#FF8A95]")}>
                    {needsVerification ? <Mail className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                    {error}
                  </p>
                  {needsVerification && (
                    <div className="mt-3 pl-6">
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] disabled:opacity-50"
                      >
                        {resending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resending…</> : <><ArrowUpFromLine className="h-3.5 w-3.5" /> Resend verification email</>}
                      </button>
                      {resendMsg && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#7BE8B8]"><CheckCircle2 className="h-3.5 w-3.5" /> {resendMsg}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">Email</label>
                  <div className="group relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="au-input h-12 w-full rounded-xl bg-[#0E1016] pl-11 pr-4 text-[15px] text-white ring-1 ring-white/[0.1] transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-2 focus:ring-[#8B7CFF]/70"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor="password" className="text-[13px] font-medium text-[#D6D8E2]">Password</label>
                    <Link to="/forgot-password" className="text-[12px] text-[#8A8FA3] transition-colors hover:text-white">Forgot password?</Link>
                  </div>
                  <div className="group relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={onPasswordKey}
                      onKeyDown={onPasswordKey}
                      onBlur={() => setCapsLock(false)}
                      required
                      className="au-input h-12 w-full rounded-xl bg-[#0E1016] pl-11 pr-12 text-[15px] text-white ring-1 ring-white/[0.1] transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-2 focus:ring-[#8B7CFF]/70"
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
                  {capsLock && <p className="mt-2 text-[12px] text-[#FFB547]">Caps Lock is on</p>}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-all hover:bg-[#A093FF] disabled:opacity-70"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                ) : (
                  <>Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-[13px] text-[#6E7389] lg:hidden">
              New to Level Up?{" "}
              <Link to="/signup" className="font-medium text-white underline-offset-4 hover:underline">Create an account</Link> — 100 free credits.
            </p>
          </div>
        </div>

        <footer className="relative flex items-center justify-center gap-5 px-5 pb-6 text-[11px] text-[#555A6E]">
          <a href="/terms.html" className="hover:text-[#8A8FA3]">Terms</a>
          <a href="/privacy-policy.html" className="hover:text-[#8A8FA3]">Privacy</a>
        </footer>
      </main>
    </div>
  );
}