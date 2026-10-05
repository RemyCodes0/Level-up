"use client";

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PageMeta } from "@/components/PageMeta";
import {
  Loader2, AlertCircle, Globe2, Lock, Paperclip, X, Copy, Check, ArrowLeft, ArrowRight,
  FileText, Sparkles, Users, MessageCircle, Link2, Wand2, Film, ClipboardList, Zap,
} from "lucide-react";
import { createCollabRoom } from "@/api/CollabApi";
import { getPricingConfig, getCreditsBalance } from "@/api/CourseApi";
import type { CourseTier } from "@/api/CourseApi";

// ─────────────────────────────────────────────────────────────────────────────
// Design primitives (dark studio)
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes nc-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes nc-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes nc-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
@keyframes nc-rec { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
.nc-rise { animation: nc-rise .55s cubic-bezier(.2,.7,.2,1) both; }
.nc-pop { animation: nc-pop .6s cubic-bezier(.2,.7,.2,1) both; }
.nc-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.nc-mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, monospace; }
.nc-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.nc-range { -webkit-appearance: none; appearance: none; background: transparent; width: 100%; height: 28px; cursor: pointer; }
.nc-range:focus { outline: none; }
.nc-range::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: transparent; }
.nc-range::-moz-range-track { height: 6px; border-radius: 999px; background: transparent; }
.nc-range::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; margin-top: -7px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 4px rgba(139,124,255,.35), 0 4px 12px rgba(0,0,0,.5); transition: box-shadow .2s; }
.nc-range::-moz-range-thumb { height: 20px; width: 20px; border: 0; border-radius: 999px; background: #fff; box-shadow: 0 0 0 4px rgba(139,124,255,.35), 0 4px 12px rgba(0,0,0,.5); }
.nc-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 6px rgba(139,124,255,.55), 0 4px 12px rgba(0,0,0,.5); }
`;

const LABEL = "text-[13px] font-semibold text-white";
const HINT = "text-[11px] text-[#6E7389]";
const FIELD = "w-full rounded-xl bg-[#0A0B10]/70 px-4 text-[15px] text-white ring-1 ring-white/[0.1] transition-all placeholder:text-[#3E4253] focus:outline-none focus:ring-[#8B7CFF]/70";

const THRESHOLD_PRESETS = [50, 75, 100];

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <PageMeta title={title} noindex />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden" aria-hidden="true">
        <div className="absolute -top-56 left-1/3 h-[480px] w-[760px] -translate-x-1/2 rounded-full opacity-25 blur-[110px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "nc-aurora 18s ease-in-out infinite" }} />
        <div className="absolute -right-32 top-10 h-[320px] w-[440px] rounded-full opacity-[0.13] blur-[110px]" style={{ background: "radial-gradient(closest-side, #3DDC97, transparent)", animation: "nc-aurora 22s ease-in-out infinite reverse" }} />
        <div className="nc-grain absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0A0B10]" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateCollabRoom() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<"public" | "invite-only">("invite-only");
  const [completionThreshold, setCompletionThreshold] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ roomId: string; inviteCode: string; joinUrl: string } | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [dragging, setDragging] = useState(false);

  // Same tier mechanism the solo course page uses (PricingConfig's
  // quick_explainer/deeper_dive/full_mastery — 1/3/6 lessons) — reused as-is
  // rather than inventing a separate collab-only shape.
  const [tierKey, setTierKey] = useState<string | null>(null);
  const [courseTiers, setCourseTiers] = useState<CourseTier[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    getPricingConfig().then((cfg) => setCourseTiers(cfg.courseTiers)).catch((err) => console.error("Failed to fetch pricing config:", err));
    getCreditsBalance().then((c) => setBalance(c.spendableBalance)).catch((err) => console.error("Failed to fetch credits:", err));
  }, []);

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!(f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") || f.name.toLowerCase().endsWith(".pptx"))) {
      setError("Only PDF or PPTX files are supported.");
      return;
    }
    setFile(f);
    if (error) setError(null);
  };

  const submit = async () => {
    if (busy) return;
    if (!topic.trim() && !file) {
      setError("Add a topic or upload a PDF/PPTX.");
      return;
    }
    if (!tierKey) {
      setError("Choose how much depth the group wants.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createCollabRoom(topic.trim(), file, {
        name: name.trim() || topic.trim(),
        visibility,
        completionThreshold,
        tier: tierKey,
      });
      setCreated(result);
    } catch (err: any) {
      setError(err.message || "Failed to create study group");
    } finally {
      setBusy(false);
    }
  };

  const copy = (what: "code" | "link", text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  // ── Success ───────────────────────────────────────────────────────────────
  if (created) {
    const shareText = `Join my Level Up study group "${name.trim() || topic.trim() || "Study group"}" — invite code ${created.inviteCode}: ${created.joinUrl}`;
    return (
      <Shell title="Study Group Created | Level Up AI">
        <main className="mx-auto max-w-lg px-4 pb-24 pt-16 text-center sm:pt-24">
          <div className="nc-pop relative mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#3DDC97]/12 ring-1 ring-[#3DDC97]/40">
            <span className="absolute inset-0 rounded-2xl bg-[#3DDC97]/20 blur-xl" />
            <Check className="relative h-7 w-7 text-[#3DDC97]" strokeWidth={3} />
          </div>
          <h1 className="nc-rise nc-serif text-[44px] leading-[1.04] text-white sm:text-[56px]">Your group is live.</h1>
          <p className="nc-rise mx-auto mt-3 max-w-sm text-[15px] text-[#8A8FA3]" style={{ animationDelay: "60ms" }}>
            <span className="inline-flex items-center gap-1.5 text-[#FFB08A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A45]" style={{ animation: "nc-rec 1.4s ease-in-out infinite" }} /> The course is generating now.
            </span>{" "}
            Share the code below — anyone with it can join.
          </p>

          <div className="nc-rise mt-9" style={{ animationDelay: "120ms" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">Invite code</p>
            <button
              onClick={() => copy("code", created.inviteCode)}
              className="group mt-3 flex w-full items-center justify-center gap-1.5 sm:gap-2"
              title="Copy invite code"
            >
              {created.inviteCode.split("").map((ch, i) => (
                <span
                  key={i}
                  className={cx(
                    "nc-mono flex h-14 w-9 items-center justify-center rounded-xl text-2xl font-semibold ring-1 transition-all sm:h-16 sm:w-11 sm:text-3xl",
                    copied === "code" ? "bg-[#3DDC97]/10 text-[#7BE8B8] ring-[#3DDC97]/40" : "bg-white/[0.04] text-white ring-white/[0.1] group-hover:ring-white/[0.2]"
                  )}
                  style={{ transitionDelay: `${i * 20}ms` }}
                >
                  {ch}
                </span>
              ))}
            </button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#6E7389]">
              {copied === "code" ? <><Check className="h-3.5 w-3.5 text-[#3DDC97]" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Click to copy</>}
            </p>
          </div>

          <div className="nc-rise mt-8 space-y-2.5" style={{ animationDelay: "180ms" }}>
            <button
              onClick={() => copy("link", created.joinUrl)}
              className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.03] px-4 py-3 text-left ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.06]"
            >
              <Link2 className="h-4 w-4 shrink-0 text-[#6E7389]" />
              <span className="nc-mono flex-1 truncate text-xs text-[#B9BCCB]">{created.joinUrl}</span>
              {copied === "link" ? <Check className="h-4 w-4 shrink-0 text-[#3DDC97]" /> : <Copy className="h-4 w-4 shrink-0 text-[#6E7389]" />}
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/[0.05] text-sm font-medium text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]"
              >
                <MessageCircle className="h-4 w-4 text-[#3DDC97]" /> WhatsApp
              </a>
              <button
                onClick={() => navigate(`/collab/${created.roomId}`)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] transition-colors hover:bg-[#A093FF]"
              >
                Open group <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </main>
      </Shell>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const displayName = name.trim() || topic.trim() || (file ? file.name.replace(/\.(pdf|pptx)$/i, "") : "") || "Your study group";
  const selectedTier = courseTiers?.find((t) => t.key === tierKey) ?? null;
  const canSubmit = !busy && (!!topic.trim() || !!file) && !!tierKey;

  return (
    <Shell title="New Study Group | Level Up AI">
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <button onClick={() => navigate("/collab")} className="nc-rise mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-[#6E7389] transition-colors hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Study groups
        </button>
        <div className="nc-rise max-w-xl">
          <h1 className="nc-serif text-[44px] leading-[1.02] text-white sm:text-[60px]">
            Start a <span className="italic bg-gradient-to-r from-[#7BE8B8] via-[#8B7CFF] to-[#FF7A45] bg-clip-text text-transparent">study group</span>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#8A8FA3]">Everyone watches the same AI-generated course and keeps their own progress.</p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Form */}
          <div className="nc-rise space-y-7 rounded-3xl bg-[#11131A]/90 p-5 ring-1 ring-white/[0.07] backdrop-blur sm:p-8" style={{ animationDelay: "60ms" }}>
            {/* Step 1: content */}
            <section>
              <StepLabel n={1} title="What will you learn?" />
              <textarea
                id="topic"
                value={topic}
                onChange={(e) => { setTopic(e.target.value); if (error) setError(null); }}
                placeholder="Explain cellular respiration and the Krebs cycle…"
                rows={3}
                className={cx(FIELD, "resize-none py-3.5 leading-relaxed")}
              />
              <input ref={fileRef} type="file" accept=".pdf,.pptx" className="hidden" onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[#3E4253]">
                <span className="h-px flex-1 bg-white/[0.06]" /> or <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
              {file ? (
                <div className="flex items-center gap-3 rounded-xl bg-[#8B7CFF]/[0.08] px-3.5 py-3 ring-1 ring-[#8B7CFF]/25">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#8B7CFF]/15"><FileText className="h-4 w-4 text-[#B4A9FF]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{file.name}</span>
                    <span className="block text-[11px] text-[#8A8FA3]">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  </span>
                  <button onClick={() => setFile(null)} className="rounded-lg p-1.5 text-[#8A8FA3] transition-colors hover:bg-white/10 hover:text-white" aria-label="Remove file">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
                  className={cx(
                    "flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-5 text-sm transition-all",
                    dragging ? "border-[#8B7CFF] bg-[#8B7CFF]/[0.08] text-white" : "border-white/[0.14] text-[#8A8FA3] hover:border-white/[0.3] hover:text-white"
                  )}
                >
                  <span className="flex items-center gap-2 font-medium"><Paperclip className="h-4 w-4" /> {dragging ? "Drop to attach" : "Upload lecture notes"}</span>
                  <span className={HINT}>PDF or PPTX · drag & drop or click</span>
                </button>
              )}
            </section>

            {/* Step 2: depth (same tier mechanism as the solo course page) */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <StepLabel n={2} title="How much depth?" />
                {balance != null && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[#E3E5EE] ring-1 ring-white/[0.08]">
                    <Zap className="h-3 w-3 text-[#FFB547]" /> {balance} credit{balance !== 1 ? "s" : ""} available
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup">
                {!courseTiers
                  ? [0, 1, 2].map((i) => <div key={i} className="h-[150px] animate-pulse rounded-xl bg-white/[0.03]" />)
                  : courseTiers.map((t) => {
                      const affordable = balance == null || balance >= t.creditCost;
                      const sel = tierKey === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          aria-disabled={!affordable}
                          disabled={!affordable}
                          onClick={() => setTierKey(t.key)}
                          className={cx(
                            "relative flex flex-col rounded-xl p-3.5 text-left ring-1 transition-all",
                            !affordable
                              ? "cursor-not-allowed bg-white/[0.02] opacity-50 ring-white/[0.05]"
                              : sel
                              ? "bg-[#8B7CFF]/[0.1] ring-2 ring-[#8B7CFF]"
                              : "bg-white/[0.02] ring-white/[0.08] hover:ring-white/[0.2]"
                          )}
                        >
                          <span className={cx("absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full ring-1", sel ? "bg-[#8B7CFF] ring-[#8B7CFF]" : "ring-white/20")}>
                            {sel && <Check className="h-2.5 w-2.5 text-[#0A0B10]" strokeWidth={3} />}
                          </span>
                          <p className="pr-6 text-sm font-semibold text-white">{t.name}</p>
                          <p className="mt-1 min-h-[32px] text-[11px] leading-relaxed text-[#8A8FA3]">{t.description}</p>
                          <div className="mt-2.5 space-y-1 text-[11px] text-[#B9BCCB]">
                            <p className="flex items-center gap-1.5"><Film className="h-3 w-3 text-[#6E7389]" />{t.lessonCount} video{t.lessonCount !== 1 ? "s" : ""}</p>
                            <p className="flex items-center gap-1.5"><ClipboardList className="h-3 w-3 text-[#6E7389]" />{t.mcqCount} quiz questions</p>
                          </div>
                          <p className="mt-auto pt-3 text-lg font-bold text-white">{t.creditCost}<span className="ml-1 text-[10px] font-medium text-[#6E7389]">credits</span></p>
                          {!affordable && <p className="mt-1 text-[10px] text-[#FF8A95]">Not enough credits</p>}
                        </button>
                      );
                    })}
              </div>
            </section>

            {/* Step 3: name */}
            <section>
              <StepLabel n={3} title="Name your group" optional />
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bio 101 Study Group"
                className={cx(FIELD, "h-12")}
              />
              <p className={cx(HINT, "mt-1.5")}>Leave blank to use the topic.</p>
            </section>

            {/* Step 3: visibility */}
            <section>
              <StepLabel n={4} title="Who can join?" />
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup">
                {([
                  { v: "invite-only", icon: Lock, t: "Invite only", d: "Only people with your code" },
                  { v: "public", icon: Globe2, t: "Public", d: "Anyone can find and join" },
                ] as const).map(({ v, icon: Icon, t, d }) => {
                  const sel = visibility === v;
                  return (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={sel}
                      onClick={() => setVisibility(v)}
                      className={cx(
                        "relative rounded-xl p-3.5 text-left ring-1 transition-all",
                        sel ? "bg-[#8B7CFF]/[0.1] ring-2 ring-[#8B7CFF]" : "bg-white/[0.02] ring-white/[0.08] hover:ring-white/[0.2]"
                      )}
                    >
                      <span className={cx("absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full ring-1", sel ? "bg-[#8B7CFF] ring-[#8B7CFF]" : "ring-white/20")}>
                        {sel && <Check className="h-2.5 w-2.5 text-[#0A0B10]" strokeWidth={3} />}
                      </span>
                      <Icon className={cx("h-4 w-4", sel ? "text-[#B4A9FF]" : "text-[#6E7389]")} />
                      <p className="mt-2 text-sm font-semibold text-white">{t}</p>
                      <p className="mt-0.5 text-[11px] text-[#8A8FA3]">{d}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 4: remedial threshold */}
            <section>
              <StepLabel n={5} title="Remedial lesson trigger" />
              <div className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.08]">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs leading-relaxed text-[#8A8FA3]">
                    When <span className="font-semibold text-white">{completionThreshold}%</span> of members submit the quiz, AI adds a lesson on the group's weakest topic.
                  </p>
                  <span className="nc-mono shrink-0 text-2xl font-semibold text-white">{completionThreshold}<span className="text-sm text-[#6E7389]">%</span></span>
                </div>
                <div className="relative mt-3">
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#8B7CFF] to-[#3DDC97]" style={{ width: `${((completionThreshold - 1) / 99) * 100}%` }} />
                  </div>
                  <input
                    id="threshold"
                    type="range"
                    min={1}
                    max={100}
                    value={completionThreshold}
                    onChange={(e) => setCompletionThreshold(Number(e.target.value))}
                    className="nc-range relative"
                    aria-label="Remedial lesson trigger percentage"
                  />
                </div>
                <div className="mt-2 flex gap-1.5">
                  {THRESHOLD_PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setCompletionThreshold(p)}
                      className={cx(
                        "rounded-lg px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors",
                        completionThreshold === p ? "bg-white text-[#0A0B10] ring-white" : "text-[#8A8FA3] ring-white/[0.1] hover:text-white"
                      )}
                    >
                      {p === 100 ? "Everyone" : `${p}%`}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {error && (
              <p className="flex items-center gap-2 rounded-xl bg-[#FF5C6C]/[0.08] px-3.5 py-2.5 text-xs text-[#FF8A95] ring-1 ring-[#FF5C6C]/25">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] transition-all hover:bg-[#A093FF] disabled:bg-white/[0.06] disabled:text-[#555A6E] disabled:shadow-none"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating your group…</> : <><Sparkles className="h-4 w-4" /> Create study group</>}
            </button>
          </div>

          {/* Live preview */}
          <aside className="nc-rise hidden lg:block" style={{ animationDelay: "120ms" }}>
            <div className="sticky top-24">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">Preview</p>
              <div className="relative overflow-hidden rounded-2xl bg-[#11131A] p-5 ring-1 ring-white/[0.1] shadow-[0_30px_60px_-30px_rgba(0,0,0,1)]">
                <span className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br from-[#8B7CFF] to-[#3DDC97] opacity-25 blur-2xl" />
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8B7CFF] to-transparent opacity-60" />
                <div className="relative flex items-start justify-between gap-3">
                  <h3 className={cx("nc-serif line-clamp-2 text-[26px] leading-[1.1]", name.trim() || topic.trim() || file ? "text-white" : "text-[#3E4253]")}>{displayName}</h3>
                  <span
                    className={cx(
                      "mt-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                      visibility === "public" ? "bg-[#3DDC97]/10 text-[#7BE8B8] ring-[#3DDC97]/25" : "bg-white/[0.04] text-[#B9BCCB] ring-white/[0.1]"
                    )}
                  >
                    {visibility === "public" ? <Globe2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                    {visibility === "public" ? "Public" : "Invite only"}
                  </span>
                </div>
                <p className="relative mt-1.5 line-clamp-2 text-[13px] text-[#8A8FA3]">{topic.trim() || (file ? file.name : "Your topic appears here")}</p>
                {selectedTier && (
                  <div className="relative mt-4 flex items-center gap-3 text-[11px] text-[#B9BCCB]">
                    <span className="flex items-center gap-1.5"><Film className="h-3 w-3 text-[#6E7389]" />{selectedTier.lessonCount} video{selectedTier.lessonCount !== 1 ? "s" : ""}</span>
                    <span className="flex items-center gap-1.5"><ClipboardList className="h-3 w-3 text-[#6E7389]" />{selectedTier.mcqCount} questions</span>
                  </div>
                )}
                <div className="relative mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-[#B9BCCB]">
                  <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> 1 member</span>
                  <span className="flex items-center gap-1.5 text-[#FFB08A]"><span className="h-1.5 w-1.5 rounded-full bg-[#FF7A45]" /> Generating</span>
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-xs text-[#8A8FA3]">
                {[
                  { icon: Wand2, t: "AI builds one shared course for the whole group." },
                  { icon: Users, t: "Each member watches and quizzes at their own pace." },
                  { icon: Sparkles, t: `At ${completionThreshold}% completion, a remedial lesson targets your weakest topic.` },
                ].map(({ icon: I, t }, i) => (
                  <li key={i} className="flex gap-2.5"><I className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B4A9FF]" /> {t}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </Shell>
  );
}

function StepLabel({ n, title, optional = false }: { n: number; title: string; optional?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="nc-mono flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.05] text-[10px] font-semibold text-[#B4A9FF] ring-1 ring-white/[0.1]">{n}</span>
      <p className={LABEL}>{title}</p>
      {optional && <span className="text-[11px] text-[#555A6E]">optional</span>}
    </div>
  );
}