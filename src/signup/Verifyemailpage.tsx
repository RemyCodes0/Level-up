import { useEffect, useState, useRef } from "react";
import type React from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, X, ArrowRight, Mail, Loader2, Zap, Film, Target, RotateCcw, CheckCircle2 } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes ve-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes ve-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes ve-spin { to { transform: rotate(360deg); } }
@keyframes ve-pop { 0% { transform: scale(.5); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); } }
@keyframes ve-ring { 0% { transform: scale(.9); opacity: .7; } 100% { transform: scale(2); opacity: 0; } }
@keyframes ve-confetti { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) rotate(var(--r)); opacity: 0; } }
@keyframes ve-coin { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-6px) rotate(6deg); } }
.ve-rise { animation: ve-rise .6s cubic-bezier(.2,.7,.2,1) both; }
.ve-pop { animation: ve-pop .6s cubic-bezier(.2,.7,.2,1) both; }
.ve-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.ve-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.ve-input:-webkit-autofill { -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0 1000px #0E1016 inset; transition: background-color 9999s; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

const PRIMARY = "group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-[15px] font-semibold text-[#0A0B10] shadow-[0_12px_32px_-10px_rgba(139,124,255,0.85)] transition-all hover:bg-[#A093FF] disabled:opacity-70";
const CONFETTI_COLORS = ["#8B7CFF", "#3DDC97", "#FF7A45", "#FFB547", "#5CE1FF"];

function Burst() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const d = 70 + (i % 3) * 22;
        return (
          <span
            key={i}
            className="absolute h-2 w-1 rounded-sm"
            style={{
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              ["--dx" as any]: `${Math.cos(a) * d}px`,
              ["--dy" as any]: `${Math.sin(a) * d}px`,
              ["--r" as any]: `${(i % 2 ? 1 : -1) * 260}deg`,
              animation: `ve-confetti 1.1s cubic-bezier(.2,.7,.2,1) ${0.15 + (i % 4) * 0.03}s both`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  // Resend (error state only)
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Fire the verify request exactly ONCE — StrictMode double-invokes effects,
  // and a second call would find the one-time token already consumed and show
  // a false "Verification failed" to someone who IS verified.
  const hasVerified = useRef(false);

  useEffect(() => {
    document.body.style.background = "#0A0B10";
    return () => { document.body.style.background = ""; };
  }, []);

  useEffect(() => {
    if (hasVerified.current) return;
    hasVerified.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("This link is missing its verification token — it may have been cut off when copied.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
        } else {
          setStatus("error");
          setMessage(data.message || "Verification failed.");
        }
      } catch {
        setStatus("error");
        setMessage("Could not reach the server. Please try again.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || resending) return;
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setResendMsg({ ok: res.ok, text: data.message || (res.ok ? "A fresh link is on its way." : "Couldn't resend — please try again.") });
    } catch {
      setResendMsg({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <Helmet>
        <title>Verify your email — Level Up AI</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>

      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute -top-56 left-1/2 h-[580px] w-[780px] -translate-x-1/2 rounded-full opacity-30 blur-[120px] transition-[background] duration-1000"
          style={{
            background: `radial-gradient(closest-side, ${status === "success" ? "#3DDC97" : status === "error" ? "#FF5C6C" : "#8B7CFF"}, transparent)`,
            animation: "ve-aurora 18s ease-in-out infinite",
          }}
        />
        <div className="ve-grain absolute inset-0 opacity-60" />
      </div>

      <header className="relative flex h-16 items-center px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="h-8 w-8 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
            <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
          </span>
          <span className="ve-serif text-xl text-white">Level Up</span>
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 pb-16" aria-live="polite">
        {status === "loading" && (
          <div className="ve-rise w-full max-w-[420px] text-center">
            <div className="relative mx-auto mb-8 h-16 w-16">
              <span className="absolute inset-0 rounded-full border-2 border-white/[0.08]" />
              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#8B7CFF] border-r-[#8B7CFF]/40" style={{ animation: "ve-spin 1s linear infinite" }} />
              <span className="absolute inset-0 flex items-center justify-center"><Mail className="h-6 w-6 text-[#B4A9FF]" /></span>
            </div>
            <h1 className="ve-serif text-[44px] leading-[1.02] text-white">Verifying your email…</h1>
            <p className="mt-3 text-[15px] text-[#8A8FA3]">This will only take a moment.</p>
          </div>
        )}

        {status === "success" && (
          <div className="w-full max-w-[420px] text-center">
            <div className="relative mx-auto mb-8 flex h-16 w-16 items-center justify-center">
              <Burst />
              <span className="absolute inset-0 rounded-2xl bg-[#3DDC97]/30" style={{ animation: "ve-ring 1.6s ease-out .2s infinite" }} />
              <span className="ve-pop relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[#3DDC97]/15 ring-1 ring-[#3DDC97]/40">
                <Check className="h-7 w-7 text-[#3DDC97]" strokeWidth={3} />
              </span>
            </div>
            <h1 className="ve-rise ve-serif text-[52px] leading-[1.02] text-white">You're verified.</h1>
            <p className="ve-rise mt-3 text-[15px] text-[#8A8FA3]" style={{ animationDelay: "60ms" }}>{message}</p>

            <div className="ve-rise mt-8 rounded-2xl bg-gradient-to-br from-[#FFB547]/[0.1] to-[#8B7CFF]/[0.06] p-4 text-left ring-1 ring-[#FFB547]/25" style={{ animationDelay: "120ms" }}>
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FFB547] to-[#FF7A45] shadow-[0_0_24px_-4px_rgba(255,181,71,0.8)]" style={{ animation: "ve-coin 4s ease-in-out infinite" }}>
                  <Zap className="h-5 w-5 fill-[#2A1A00] text-[#2A1A00]" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">100 free credits are waiting</p>
                  <p className="mt-0.5 text-[13px] text-[#B9BCCB]">Log in and turn your first topic into a course.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-4 border-t border-white/[0.06] pt-3 text-[12px] text-[#8A8FA3]">
                <span className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5 text-[#B4A9FF]" /> Animated lessons</span>
                <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-[#3DDC97]" /> Readiness quiz</span>
              </div>
            </div>

            <button onClick={() => navigate("/login")} className={`${PRIMARY} ve-rise mt-6`} style={{ animationDelay: "180ms" }}>
              Log in to start learning <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="ve-rise w-full max-w-[420px] text-center">
            <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FF5C6C]/10 ring-1 ring-[#FF5C6C]/30">
              <X className="h-7 w-7 text-[#FF5C6C]" strokeWidth={3} />
            </div>
            <h1 className="ve-serif text-[48px] leading-[1.02] text-white">Link didn't work</h1>
            <p className="mx-auto mt-3 max-w-sm text-[15px] text-[#8A8FA3]">{message}</p>
            <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6E7389]">If you already verified, just log in. Otherwise, get a fresh link below.</p>

            <form onSubmit={handleResend} className="mt-8 rounded-2xl bg-[#11131A]/90 p-4 text-left ring-1 ring-white/[0.08]">
              <label htmlFor="resend-email" className="text-[13px] font-medium text-[#D6D8E2]">Send a new verification link</label>
              <div className="mt-2.5 flex gap-2">
                <div className="group relative min-w-0 flex-1">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                  <input
                    id="resend-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setResendMsg(null); }}
                    required
                    className="ve-input h-11 w-full rounded-xl bg-[#0E1016] pl-10 pr-3 text-[14px] text-white ring-1 ring-white/[0.1] transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-2 focus:ring-[#8B7CFF]/70"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resending || !email.trim()}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#0A0B10] transition-all hover:bg-[#E3E0FF] disabled:bg-white/[0.06] disabled:text-[#555A6E]"
                >
                  {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Send
                </button>
              </div>
              {resendMsg && (
                <p className={`mt-2.5 flex items-center gap-1.5 text-[12px] ${resendMsg.ok ? "text-[#7BE8B8]" : "text-[#FF8A95]"}`}>
                  {resendMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {resendMsg.text}
                </p>
              )}
            </form>

            <button
              onClick={() => navigate("/login")}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.05] text-[15px] font-medium text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]"
            >
              Go to login <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}