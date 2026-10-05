"use client";

import type React from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Mail, ArrowRight, ArrowLeft, Loader2, KeyRound, RotateCcw, ExternalLink, Clock } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const RESEND_COOLDOWN_S = 60;

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes fp-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes fp-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes fp-fly { 0% { transform: translate(0,0) rotate(0deg); opacity: 1; } 60% { transform: translate(18px,-14px) rotate(-8deg); opacity: 1; } 100% { transform: translate(0,0) rotate(0deg); opacity: 1; } }
@keyframes fp-ring { 0% { transform: scale(.9); opacity: .6; } 100% { transform: scale(1.9); opacity: 0; } }
.fp-rise { animation: fp-rise .6s cubic-bezier(.2,.7,.2,1) both; }
.fp-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.fp-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.fp-input:-webkit-autofill, .fp-input:-webkit-autofill:hover, .fp-input:-webkit-autofill:focus {
  -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0 1000px #0E1016 inset; caret-color: #fff; transition: background-color 9999s;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

// Offer a one-tap shortcut to the user's inbox for the common providers.
function inboxFor(email: string): { label: string; url: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { label: "Open Gmail", url: "https://mail.google.com/mail/u/0/#search/level+up" };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return { label: "Open Outlook", url: "https://outlook.live.com/mail/0/" };
  if (["yahoo.com", "ymail.com"].includes(domain)) return { label: "Open Yahoo Mail", url: "https://mail.yahoo.com/" };
  if (["icloud.com", "me.com", "mac.com"].includes(domain)) return { label: "Open iCloud Mail", url: "https://www.icloud.com/mail" };
  return null;
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <Helmet>
        <title>Forgot password — Level Up AI</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-56 left-1/2 h-[560px] w-[760px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "fp-aurora 18s ease-in-out infinite" }} />
        <div className="absolute -bottom-40 -left-32 h-[420px] w-[520px] rounded-full opacity-[0.14] blur-[120px]" style={{ background: "radial-gradient(closest-side, #3DDC97, transparent)", animation: "fp-aurora 22s ease-in-out infinite reverse" }} />
        <div className="fp-grain absolute inset-0 opacity-60" />
      </div>
      <header className="relative flex h-16 items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="h-8 w-8 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
            <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
          </span>
          <span className="fp-serif text-xl text-white">Level Up</span>
        </Link>
        <Link to="/login" className="text-[13px] text-[#8A8FA3] transition-colors hover:text-white">Log in</Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-16 pt-6">{children}</main>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    document.body.style.background = "#0A0B10";
    document.body.style.minHeight = "100dvh";
    // No background reset on cleanup (deliberate) — see Login.tsx's own
    // comment on the identical effect for why: resetting to "" exposes
    // index.css's light default for a frame until the next page's effect
    // sets its own color, which is exactly the white flash between pages.
    return () => {
      document.body.style.minHeight = "";
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // The backend answers with the same generic success whether or not the
  // email exists, so the UI always moves to "sent" — the catch only covers a
  // genuine network failure, never reveals "email not found".
  const request = async () => {
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/auth/forgot-password`, { email });
    } catch {
      // intentionally silent — see above
    } finally {
      setLoading(false);
      setSent(true);
      setCooldown(RESEND_COOLDOWN_S);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResent(false);
    await request();
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    await request();
    setResent(true);
  };

  if (sent) {
    const inbox = inboxFor(email);
    return (
      <AuthShell>
        <div className="w-full max-w-[420px] text-center">
          <div className="fp-rise relative mx-auto mb-8 flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-2xl bg-[#8B7CFF]/25" style={{ animation: "fp-ring 1.8s ease-out infinite" }} />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[#8B7CFF]/15 ring-1 ring-[#8B7CFF]/40" style={{ animation: "fp-fly 1.2s cubic-bezier(.2,.7,.2,1) both" }}>
              <Mail className="h-7 w-7 text-[#B4A9FF]" />
            </span>
          </div>

          <h1 className="fp-rise fp-serif text-[48px] leading-[1.02] text-white">Check your inbox</h1>
          <p className="fp-rise mt-4 text-[15px] leading-relaxed text-[#8A8FA3]" style={{ animationDelay: "60ms" }}>
            If an account exists for
          </p>
          <p className="fp-rise mx-auto mt-1.5 w-fit max-w-full truncate rounded-lg bg-white/[0.05] px-3 py-1.5 text-[15px] font-medium text-white ring-1 ring-white/[0.08]" style={{ animationDelay: "90ms" }}>
            {email}
          </p>
          <p className="fp-rise mt-3 text-[15px] text-[#8A8FA3]" style={{ animationDelay: "120ms" }}>we've sent a link to reset your password.</p>
          <p className="fp-rise mt-4 inline-flex items-center gap-1.5 text-[12px] text-[#6E7389]" style={{ animationDelay: "150ms" }}>
            <Clock className="h-3.5 w-3.5" /> The link expires in 1 hour · check your spam folder too
          </p>

          <div className="fp-rise mt-8 space-y-2.5" style={{ animationDelay: "200ms" }}>
            {inbox && (
              <a
                href={inbox.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-colors hover:bg-[#A093FF]"
              >
                {inbox.label} <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Link
              to="/login"
              className={
                inbox
                  ? "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.05] text-[15px] font-medium text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]"
                  : "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-colors hover:bg-[#A093FF]"
              }
            >
              <ArrowLeft className="h-4 w-4" /> Back to login
            </Link>
          </div>

          <div className="fp-rise mt-8 border-t border-white/[0.06] pt-6 text-[13px] text-[#6E7389]" style={{ animationDelay: "250ms" }}>
            Didn't get it?{" "}
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              className="inline-flex items-center gap-1 font-medium text-white underline-offset-4 hover:underline disabled:cursor-default disabled:text-[#555A6E] disabled:no-underline"
            >
              {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</> : cooldown > 0 ? `Resend in ${cooldown}s` : <><RotateCcw className="h-3.5 w-3.5" /> Resend</>}
            </button>
            <span className="mx-2 text-[#3E4253]">·</span>
            <button onClick={() => { setSent(false); setResent(false); }} className="font-medium text-white underline-offset-4 hover:underline">
              Use a different email
            </button>
            {resent && cooldown > 0 && <p className="mt-2 text-[12px] text-[#7BE8B8]">Sent again — give it a minute to arrive.</p>}
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="fp-rise w-full max-w-[400px]">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8B7CFF]/12 ring-1 ring-[#8B7CFF]/30">
          <KeyRound className="h-5 w-5 text-[#B4A9FF]" />
        </div>
        <h1 className="fp-serif text-[44px] leading-[1.02] text-white sm:text-[52px]">Forgot your password?</h1>
        <p className="mt-2 text-[15px] text-[#8A8FA3]">No problem. Enter your email and we'll send you a reset link.</p>

        <form onSubmit={handleSubmit} className="mt-8">
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
              autoFocus
              className="fp-input h-12 w-full rounded-xl bg-[#0E1016] pl-11 pr-4 text-[15px] text-white ring-1 ring-white/[0.1] transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-2 focus:ring-[#8B7CFF]/70"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-all hover:bg-[#A093FF] disabled:opacity-70"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Send reset link <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
          </button>

          <Link to="/login" className="mx-auto mt-6 flex w-fit items-center gap-1.5 text-[13px] text-[#8A8FA3] transition-colors hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to login
          </Link>
        </form>
      </div>
    </AuthShell>
  );
}