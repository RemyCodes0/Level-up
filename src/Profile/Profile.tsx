"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import axios from "axios";
import { analytics, resetUser } from "../lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { Navbar } from "@/components/navbar/Navbar";
import { PageMeta } from "@/components/PageMeta";
import { listCourses } from "@/api/CourseApi";
import {
  User, Mail, Check, AlertCircle, LogOut, Loader2, Zap, Film, Users, Gift, ArrowRight,
  MessageSquare, Sparkles, RotateCcw, Copy,
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const WHATSAPP_COMMUNITY_URL = "https://chat.whatsapp.com/CyuV45KQ9Au3awigE39jBC";
const COURSE_COUNT_CAP = 50;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes pf-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes pf-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes pf-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes pf-spin { to { transform: rotate(360deg); } }
@keyframes pf-toast { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
.pf-rise { animation: pf-rise .55s cubic-bezier(.2,.7,.2,1) both; }
.pf-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.pf-mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, monospace; }
.pf-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.pf-input:-webkit-autofill { -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0 1000px #0E1016 inset; transition: background-color 9999s; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

const SURFACE = "rounded-3xl bg-[#11131A] ring-1 ring-white/[0.07]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]";
const INPUT = "pf-input h-12 w-full rounded-xl bg-[#0E1016] pl-11 pr-4 text-[15px] text-white ring-1 ring-white/[0.1] transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-2 focus:ring-[#8B7CFF]/70";

interface CreditsInfo { courseCredits: number; spendableBalance?: number; signupBonusCredits?: number; canGenerate: boolean; freeMode?: { enabled: boolean; limit: number; remaining: number | null } }
interface ReferralInfo { link: string; totalReferrals: number; creditsEarned: number; creditsPerReferral: number }

function Shimmer({ className }: { className?: string }) {
  return (
    <span
      className={cx("block rounded-md bg-white/[0.06]", className)}
      style={{ backgroundImage: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.08) 50%, transparent 65%)", backgroundSize: "250% 100%", animation: "pf-sweep 1.7s ease-in-out infinite" }}
    />
  );
}

function Stat({ icon: Icon, label, value, color, loading, sub }: { icon: typeof Zap; label: string; value: string | number | null; color: string; loading: boolean; sub?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.07]">
      <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: color }} />
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1A` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <div className="relative mt-3 h-8">
        {loading ? <Shimmer className="mt-1 h-6 w-12" /> : <p className="text-[26px] font-bold leading-none tracking-tight text-white">{value ?? "—"}</p>}
      </div>
      <p className="relative mt-1 text-xs text-[#8A8FA3]">{label}</p>
      {sub && <p className="relative mt-0.5 text-[11px] text-[#555A6E]">{sub}</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { loading } = useAuth();
  const router = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savedName, setSavedName] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [courseCount, setCourseCount] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const stored = localStorage.getItem("user");
  const user = stored ? JSON.parse(stored) : null;
  const token = localStorage.getItem("token");

  useEffect(() => {
    document.body.style.background = "#0A0B10";
    return () => { document.body.style.background = ""; };
  }, []);

  useEffect(() => {
    if (!loading && !user) router("/login");
    if (user) {
      const n = user.name || user.fullName || "";
      setFullName(n); setSavedName(n);
      setEmail(user.email || ""); setSavedEmail(user.email || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Account stats: credits, courses created, referrals. Each is independent —
  // one failing never blanks the others.
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    setStatsLoading(true);
    Promise.allSettled([
      axios.get(`${BASE_URL}/api/payment/credits`, { headers }).then((r) => setCredits(r.data)),
      axios.get(`${BASE_URL}/api/referral/link`, { headers }).then((r) => setReferral(r.data)),
      listCourses(1, COURSE_COUNT_CAP).then(({ courses, hasMore }) => setCourseCount(hasMore ? `${COURSE_COUNT_CAP}+` : String(courses.length))),
    ]).finally(() => setStatsLoading(false));
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ok ? 3000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0B10]">
        <div className="flex flex-col items-center gap-4">
          <span className="h-10 w-10 rounded-full border-2 border-white/10 border-t-[#8B7CFF]" style={{ animation: "pf-spin 1s linear infinite" }} />
          <p className="text-sm text-[#8A8FA3]" style={{ fontFamily: "'Geist', ui-sans-serif, system-ui" }}>Loading your profile…</p>
        </div>
        <style>{PAGE_CSS}</style>
      </div>
    );
  }

  if (!user) return null;

  const dirty = fullName.trim() !== savedName || email.trim() !== savedEmail;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await axios.put(
        `${BASE_URL}/api/auth/${user._id}`,
        { name: fullName, email },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      localStorage.setItem("user", JSON.stringify(res.data));
      setSavedName((res.data?.name ?? fullName).trim());
      setSavedEmail((res.data?.email ?? email).trim());
      setToast({ ok: true, text: "Profile updated" });
    } catch (err) {
      console.error("Update failed:", err);
      setToast({ ok: false, text: "Failed to update profile. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    analytics.loggedOut();
    resetUser(); // clear PostHog identity so the next user on this device is separate
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    router("/login");
  };

  const copyReferral = () => {
    if (!referral?.link) return;
    navigator.clipboard.writeText(referral.link).catch(() => {});
    analytics.referralLinkCopied();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const displayName = savedName || "Learner";
  const initial = displayName.charAt(0).toUpperCase();
  const balance = credits ? Math.max(credits.spendableBalance ?? credits.courseCredits, 0) : null;
  const bonus = Math.max(credits?.signupBonusCredits ?? 0, 0);
  const freeMode = credits?.freeMode?.enabled ? credits.freeMode : null;

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <PageMeta title="Your Profile | Level Up AI" noindex />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>
      <Navbar />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden" aria-hidden="true">
        <div className="absolute -top-56 left-1/3 h-[480px] w-[760px] -translate-x-1/2 rounded-full opacity-25 blur-[110px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)" }} />
        <div className="absolute -right-32 top-10 h-[320px] w-[440px] rounded-full opacity-[0.12] blur-[110px]" style={{ background: "radial-gradient(closest-side, #FF7A45, transparent)" }} />
        <div className="pf-grain absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0A0B10]" />
      </div>

      <main className="relative mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        {/* Identity header */}
        <div className="pf-rise flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <span className="absolute -inset-1 rounded-full bg-gradient-to-br from-[#8B7CFF] via-[#FF7A45] to-[#3DDC97] opacity-80 blur-[2px]" />
            <span className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[#11131A] ring-4 ring-[#0A0B10] sm:h-28 sm:w-28">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="pf-serif text-5xl text-white">{initial}</span>
              )}
            </span>
          </div>
          <div className="min-w-0">
            <p className={EYEBROW}>Your account</p>
            <h1 className="pf-serif mt-1 truncate text-[44px] leading-[1.02] text-white sm:text-[56px]">{displayName}</h1>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[15px] text-[#8A8FA3]"><Mail className="h-4 w-4 shrink-0" /> {savedEmail}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="pf-rise mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: "60ms" }}>
          {freeMode ? (
            <Stat icon={Zap} label="Free lessons left today" value={freeMode.remaining ?? freeMode.limit} color="#3DDC97" loading={false} />
          ) : (
            <Stat icon={Zap} label="Credits available" value={balance} color="#FFB547" loading={statsLoading && !credits} sub={bonus > 0 ? `${bonus} free signup credits left` : undefined} />
          )}
          <Stat icon={Film} label="Courses created" value={courseCount} color="#8B7CFF" loading={statsLoading && courseCount === null} />
          <Stat icon={Users} label="Friends invited" value={referral?.totalReferrals ?? null} color="#3DDC97" loading={statsLoading && !referral} />
          <Stat icon={Gift} label="Credits from invites" value={referral?.creditsEarned ?? null} color="#FF7A45" loading={statsLoading && !referral} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Personal info */}
          <form onSubmit={handleSubmit} className={cx(SURFACE, "pf-rise p-6 sm:p-8")} style={{ animationDelay: "120ms" }}>
            <div className="flex items-center gap-2.5">
              <User className="h-4 w-4 text-[#B4A9FF]" />
              <h2 className="text-[15px] font-semibold text-white">Personal information</h2>
            </div>
            <p className="mt-1 text-sm text-[#8A8FA3]">How you appear across Level Up and in study groups.</p>

            <div className="mt-7 space-y-5">
              <div>
                <label htmlFor="fullName" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">Full name</label>
                <div className="group relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                  <input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required className={INPUT} />
                </div>
              </div>
              <div>
                <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-[#D6D8E2]">Email</label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555A6E] transition-colors group-focus-within:text-[#B4A9FF]" />
                  <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={INPUT} />
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => { setFullName(savedName); setEmail(savedEmail); }}
                disabled={!dirty || saving}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-medium text-[#8A8FA3] transition-colors hover:text-white disabled:opacity-0"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Discard changes
              </button>
              <button
                type="submit"
                disabled={!dirty || saving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] px-6 text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] transition-all hover:bg-[#A093FF] disabled:bg-white/[0.06] disabled:text-[#555A6E] disabled:shadow-none"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : dirty ? "Save changes" : <><Check className="h-4 w-4" /> Up to date</>}
              </button>
            </div>
          </form>

          <div className="space-y-6">
            {/* Credits */}
            {!freeMode && <div className={cx(SURFACE, "pf-rise relative overflow-hidden p-6")} style={{ animationDelay: "160ms" }}>
              <span className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#FFB547]/20 blur-3xl" />
              <div className="relative flex items-center justify-between">
                <p className={EYEBROW}>Credits</p>
                <Zap className="h-4 w-4 text-[#FFB547]" />
              </div>
              <div className="relative mt-3 flex items-baseline gap-2">
                {balance === null && statsLoading ? <Shimmer className="h-10 w-20" /> : <span className="text-[44px] font-bold leading-none tracking-tight text-white">{balance ?? "—"}</span>}
                <span className="text-sm text-[#8A8FA3]">available</span>
              </div>
              {bonus > 0 && (
                <div className="relative mt-4">
                  <div className="mb-1 flex justify-between text-[11px] text-[#8A8FA3]"><span>Free signup credits</span><span className="pf-mono">{bonus}/100</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#3DDC97]" style={{ width: `${Math.min(bonus, 100)}%` }} /></div>
                </div>
              )}
              <div className="relative mt-5 grid grid-cols-2 gap-2">
                <a href="/ai_tutor" className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white text-[13px] font-semibold text-[#0A0B10] transition-colors hover:bg-[#E3E0FF]">
                  <Sparkles className="h-3.5 w-3.5" /> New course
                </a>
                <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/[0.05] text-[13px] font-medium text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]">
                  <MessageSquare className="h-3.5 w-3.5 text-[#3DDC97]" /> Get more
                </a>
              </div>
            </div>}

            {/* Referral */}
            {referral && (
              <div className={cx(SURFACE, "pf-rise p-6")} style={{ animationDelay: "200ms" }}>
                <div className="flex items-center gap-2.5">
                  <Gift className="h-4 w-4 text-[#FFB547]" />
                  <h2 className="text-[15px] font-semibold text-white">Invite friends</h2>
                </div>
                <p className="mt-1 text-sm text-[#8A8FA3]">
                  Earn <span className="font-semibold text-[#FFB547]">+{referral.creditsPerReferral} credits</span> for every friend who signs up and verifies.
                </p>
                <button
                  onClick={copyReferral}
                  className={cx(
                    "mt-4 flex w-full items-center gap-2 rounded-xl px-3.5 py-3 text-left ring-1 transition-colors",
                    copied ? "bg-[#3DDC97]/10 ring-[#3DDC97]/40" : "bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.06]"
                  )}
                >
                  <span className="pf-mono min-w-0 flex-1 truncate text-xs text-[#B9BCCB]">{referral.link}</span>
                  {copied ? <Check className="h-4 w-4 shrink-0 text-[#3DDC97]" /> : <Copy className="h-4 w-4 shrink-0 text-[#6E7389]" />}
                </button>
              </div>
            )}

            {/* Session */}
            <div className={cx(SURFACE, "pf-rise flex items-center justify-between gap-4 p-6")} style={{ animationDelay: "240ms" }}>
              <div>
                <p className="text-[15px] font-semibold text-white">Sign out</p>
                <p className="mt-0.5 text-sm text-[#8A8FA3]">End your session on this device.</p>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium text-[#FF8A95] ring-1 ring-[#FF5C6C]/30 transition-colors hover:bg-[#FF5C6C]/10"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </div>
        </div>

        <a href="/ai_tutor" className="pf-rise mt-10 inline-flex items-center gap-1.5 text-sm text-[#8A8FA3] transition-colors hover:text-white" style={{ animationDelay: "280ms" }}>
          Back to your courses <ArrowRight className="h-4 w-4" />
        </a>
      </main>

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed bottom-6 left-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-2xl ring-1 backdrop-blur-xl",
            toast.ok ? "bg-[#0F1A15]/95 text-[#7BE8B8] ring-[#3DDC97]/30" : "bg-[#1A0F12]/95 text-[#FF8A95] ring-[#FF5C6C]/30"
          )}
          style={{ animation: "pf-toast .35s cubic-bezier(.2,.7,.2,1) both", transform: "translateX(-50%)" }}
        >
          {toast.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {toast.text}
        </div>
      )}
    </div>
  );
}