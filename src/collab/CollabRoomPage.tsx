"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PageMeta } from "@/components/PageMeta";
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, Check, X, ClipboardList, Trophy, Users,
  TrendingUp, TrendingDown, Copy, Sparkles, RotateCcw, ArrowUp, ArrowDown, Minus, Play,
  Film, Keyboard, Repeat, Target, Eye, ArrowLeft, Crown, Medal, Flag, Zap,
} from "lucide-react";
import { DynamicPlayer } from "@/remotion/DynamicPlayer";
import { LessonGeneratingView } from "@/components/LessonGeneratingView";
import { getRoom, getDashboard } from "@/api/CollabApi";
import type { RoomDashboard } from "@/api/CollabApi";
import { getProgress, markLessonWatched, logSceneReplay } from "@/api/ProgressApi";
import type { CourseProgress } from "@/api/ProgressApi";
import { submitQuiz, getLatestAttempt } from "@/api/QuizApi";
import type { QuizResult } from "@/api/QuizApi";
import { getNextSuggestions } from "@/api/CourseApi";
import type { NextCourseSuggestion } from "@/api/CourseApi";

type Tab = "watch" | "quiz" | "dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Design primitives (dark studio)
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const pad2 = (n: number) => String(n).padStart(2, "0");
const C = { iris: "#8B7CFF", ember: "#FF7A45", mint: "#3DDC97", amber: "#FFB547", rose: "#FF5C6C" };

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes cr-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes cr-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes cr-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes cr-rec { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
@keyframes cr-wave { 0%,100% { transform: scaleY(.22); } 50% { transform: scaleY(1); } }
@keyframes cr-pop { 0% { opacity: 0; transform: translateY(16px) scale(.92); } 60% { opacity: 1; transform: translateY(-3px) scale(1.02); } 100% { transform: none; } }
@keyframes cr-crown-glow { 0%,100% { filter: drop-shadow(0 0 6px rgba(255,181,71,.55)); } 50% { filter: drop-shadow(0 0 14px rgba(255,181,71,.85)); } }
.cr-rise { animation: cr-rise .5s cubic-bezier(.2,.7,.2,1) both; }
.cr-pop { animation: cr-pop .6s cubic-bezier(.2,.7,.2,1) both; }
.cr-crown { animation: cr-crown-glow 2.4s ease-in-out infinite; }
.cr-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.cr-mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, monospace; }
.cr-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.cr-noscroll::-webkit-scrollbar { display: none; } .cr-noscroll { scrollbar-width: none; }
`;

const BTN = "inline-flex items-center justify-center gap-1.5 rounded-xl h-10 px-4 text-[13px] font-medium transition-all disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]/60";
const BTN_SOFT = `${BTN} text-[#E3E5EE] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.09]`;
const BTN_PRIMARY = `${BTN} font-semibold text-[#0A0B10] bg-[#8B7CFF] hover:bg-[#A093FF] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)]`;
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]";
const SURFACE = "rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]";

const AVATAR_COLORS = ["#8B7CFF", "#3DDC97", "#FF7A45", "#5CE1FF", "#FFB547", "#FF7AD9", "#B6F36B", "#4DD4C6"];
function colorFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, id, size = 32, ring = "#0A0B10" }: { name?: string; id: string; size?: number; ring?: string }) {
  const c = colorFor(id);
  return (
    <span
      title={name}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `${c}26`, color: c, boxShadow: `0 0 0 2px ${ring}, inset 0 0 0 1px ${c}55` }}
    >
      {(name || "?")[0]?.toUpperCase()}
    </span>
  );
}

function Ring({ value, size = 44, stroke = 4, color = C.iris, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(Math.max(value, 0), 100) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      {children != null && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
    </div>
  );
}

function Shimmer({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={cx("rounded-xl bg-white/[0.04]", className)}
      style={{ backgroundImage: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)", backgroundSize: "250% 100%", animation: "cr-sweep 1.7s ease-in-out infinite", animationDelay: `${delay}s` }}
    />
  );
}

function readinessTone(pct: number) {
  if (pct >= 85) return C.mint;
  if (pct >= 70) return C.iris;
  if (pct >= 55) return C.amber;
  return C.rose;
}

function Shell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {title && <PageMeta title={title} noindex />}
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden" aria-hidden="true">
        <div className="absolute -top-56 left-1/3 h-[480px] w-[760px] -translate-x-1/2 rounded-full opacity-25 blur-[110px]" style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }} />
        <div className="absolute -right-32 top-10 h-[320px] w-[440px] rounded-full opacity-[0.12] blur-[110px]" style={{ background: `radial-gradient(closest-side, ${C.mint}, transparent)` }} />
        <div className="cr-grain absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0A0B10]" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CollabRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("watch");
  const [activeLesson, setActiveLesson] = useState(0);
  const [progress, setProgress] = useState<CourseProgress | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!roomId) return;
    try {
      const r = await getRoom(roomId);
      setRoom(r);
      setLoading(false);
      // Keep polling while the shared course (or a just-appended remedial lesson) is still generating.
      if (r.courseId?.status === "generating" || r.courseId?.lessons?.some((l: any) => l.status === "rendering")) {
        pollTimer.current = setTimeout(load, 5000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load study group");
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    load();
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [load]);

  useEffect(() => {
    if (!room?.courseId?._id) return;
    getProgress(room.courseId._id).then(setProgress).catch(() => {});
  }, [room?.courseId?._id]);

  const handleLessonEnded = async () => {
    if (!room) return;
    const lesson = room.courseId.lessons[activeLesson];
    try {
      const p = await markLessonWatched(room.courseId._id, lesson.lessonNumber);
      setProgress(p);
    } catch (err) {
      console.error("Failed to mark lesson watched:", err);
    }
  };

  const handleSeekBack = async (frame: number) => {
    if (!room) return;
    const lesson = room.courseId.lessons[activeLesson];
    const scene = lesson.scenes?.find((s: any) => frame >= s.startFrame && frame < s.endFrame);
    try {
      const p = await logSceneReplay(room.courseId._id, lesson.lessonNumber, scene?.index);
      setProgress(p);
    } catch (err) {
      console.error("Failed to log replay:", err);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="mx-auto max-w-6xl space-y-6 px-4 pt-12 sm:px-6">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-14 w-2/3" delay={0.1} />
          <Shimmer className="h-11 w-80" delay={0.2} />
          <Shimmer className="aspect-video w-full lg:w-[calc(100%-332px)]" delay={0.3} />
        </div>
      </Shell>
    );
  }

  if (error || !room) {
    return (
      <Shell>
        <div className="cr-rise flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF5C6C]/10 ring-1 ring-[#FF5C6C]/30">
            <AlertCircle className="h-6 w-6 text-[#FF5C6C]" />
          </div>
          <h1 className="cr-serif text-4xl text-white">Can't open this group</h1>
          <p className="mt-2 max-w-sm text-sm text-[#8A8FA3]">{error || "Study group not found"}</p>
          <button onClick={() => navigate("/collab")} className={cx(BTN_SOFT, "mt-7")}>
            <ArrowLeft className="h-4 w-4" /> All study groups
          </button>
        </div>
      </Shell>
    );
  }

  const course = room.courseId;
  const isWatched = (lessonNumber: number) => !!progress?.lessons.find((l) => l.lessonNumber === lessonNumber)?.watched;
  const lessons: any[] = course?.lessons ?? [];
  const watchedCount = lessons.filter((l) => isWatched(l.lessonNumber)).length;

  return (
    <Shell title={`${room.name} | Level Up AI`}>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <RoomHeader room={room} watchedCount={watchedCount} totalLessons={lessons.length} onBack={() => navigate("/collab")} />

        <div className="cr-noscroll -mx-4 mb-8 mt-8 overflow-x-auto px-4">
          <div className="inline-flex gap-1 rounded-2xl bg-white/[0.03] p-1 ring-1 ring-white/[0.07]" role="tablist">
            {([
              ["watch", "Watch", Play],
              ["quiz", "Quiz", ClipboardList],
              ["dashboard", "Group dashboard", Users],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cx(
                  "flex h-9 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[13px] font-medium transition-all",
                  tab === key ? "bg-white text-[#0A0B10] shadow" : "text-[#8A8FA3] hover:text-white"
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "watch" && (
          <WatchTab
            course={course}
            activeLesson={activeLesson}
            setActiveLesson={setActiveLesson}
            isWatched={isWatched}
            onEnded={handleLessonEnded}
            onSeekBack={handleSeekBack}
            onQuiz={() => setTab("quiz")}
          />
        )}
        {tab === "quiz" && <QuizTab course={course} roomId={room._id} />}
        {tab === "dashboard" && <DashboardTab roomId={room._id} />}
      </main>
    </Shell>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function RoomHeader({ room, watchedCount, totalLessons, onBack }: { room: any; watchedCount: number; totalLessons: number; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard.writeText(room.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const participants: any[] = room.participants ?? [];
  const generating = room.courseId?.status === "generating";

  return (
    <div className="cr-rise">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-[#6E7389] transition-colors hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Study groups
      </button>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[12px] text-[#8A8FA3]">
            <Users className="h-3.5 w-3.5 text-[#7BE8B8]" /> Study group
            {generating && (
              <span className="flex items-center gap-1.5 text-[#FFB08A]">
                · <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A45]" style={{ animation: "cr-rec 1.4s ease-in-out infinite" }} /> Course generating
              </span>
            )}
          </p>
          <h1 className="cr-serif mt-2 text-[40px] leading-[1.04] text-white sm:text-[56px]">{room.name}</h1>
          {room.courseId?.topic && <p className="mt-2 text-[15px] text-[#8A8FA3]">{room.courseId.topic}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {totalLessons > 0 && (
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] py-1.5 pl-1.5 pr-3.5 ring-1 ring-white/[0.07]">
              <Ring value={(watchedCount / totalLessons) * 100} size={32} stroke={3} color={C.mint}>
                <span className="cr-mono text-[9px] text-[#B9BCCB]">{watchedCount}</span>
              </Ring>
              <span className="text-xs text-[#B9BCCB]">of {totalLessons} watched</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] py-1.5 pl-2 pr-3.5 ring-1 ring-white/[0.07]">
            <div className="flex items-center">
              {participants.slice(0, 5).map((p: any, i: number) => (
                <span key={p.userId?._id || p.userId} style={{ marginLeft: i ? -8 : 0 }}>
                  <Avatar name={p.userId?.name} id={String(p.userId?._id || p.userId)} size={28} ring="#14161D" />
                </span>
              ))}
              {participants.length > 5 && (
                <span className="-ml-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-white/[0.08] px-1.5 text-[10px] font-semibold text-[#D6D8E2]" style={{ boxShadow: "0 0 0 2px #14161D" }}>
                  +{participants.length - 5}
                </span>
              )}
            </div>
            <span className="text-xs text-[#B9BCCB]">{participants.length} member{participants.length !== 1 ? "s" : ""}</span>
          </div>
          <button
            onClick={copyCode}
            title="Copy invite code"
            className={cx(
              "group flex h-11 items-center gap-2.5 rounded-xl px-3.5 ring-1 transition-all",
              copied ? "bg-[#3DDC97]/10 ring-[#3DDC97]/40" : "bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.06]"
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6E7389]">Invite</span>
            <span className="cr-mono text-[13px] font-semibold tracking-[0.2em] text-white">{room.inviteCode}</span>
            {copied ? <Check className="h-3.5 w-3.5 text-[#3DDC97]" /> : <Copy className="h-3.5 w-3.5 text-[#6E7389] group-hover:text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Watch tab ───────────────────────────────────────────────────────────────

function WatchTab({
  course, activeLesson, setActiveLesson, isWatched, onEnded, onSeekBack, onQuiz,
}: {
  course: any;
  activeLesson: number;
  setActiveLesson: (i: number) => void;
  isWatched: (n: number) => boolean;
  onEnded: () => void;
  onSeekBack: (frame: number) => void;
  onQuiz: () => void;
}) {
  const lessons: any[] = course.lessons ?? [];
  const lesson = lessons[activeLesson];
  const isLast = activeLesson >= lessons.length - 1;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">
        {lesson && (
          <div key={activeLesson} className="cr-rise">
            <p className={EYEBROW}>Lesson {pad2(activeLesson + 1)} <span className="text-[#3E4253]">/ {pad2(lessons.length)}</span></p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="cr-serif text-3xl leading-[1.08] text-white sm:text-[40px]">{lesson.title}</h2>
              {lesson.isRemedial && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFB547]/10 px-2.5 py-1 text-[11px] font-semibold text-[#FFB547] ring-1 ring-[#FFB547]/30">
                  <Sparkles className="h-3 w-3" /> Remedial · added for the group
                </span>
              )}
            </div>
          </div>
        )}

        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 rounded-[32px] opacity-40 blur-3xl" style={{ background: `radial-gradient(60% 60% at 50% 40%, ${C.iris}33, transparent)` }} />
          <div className="relative overflow-hidden rounded-2xl shadow-[0_40px_100px_-40px_rgba(0,0,0,1)] ring-1 ring-white/[0.08]">
            {lesson?.status === "ready" && lesson.code ? (
              <DynamicPlayer
                key={lesson.lessonNumber}
                code={lesson.code}
                durationInFrames={lesson.totalFrames ?? 3600}
                onEnded={onEnded}
                onSeekBack={onSeekBack}
                scenes={lesson.scenes}
              />
            ) : lesson?.status === "failed" ? (
              <div className="cr-grain flex aspect-video flex-col items-center justify-center gap-3 bg-[#07080C] text-center">
                <AlertCircle className="h-6 w-6 text-[#FF5C6C]" />
                <p className="text-sm text-[#B9BCCB]">This lesson failed to generate.</p>
              </div>
            ) : (
              // Same generation-in-progress animation as the solo course
              // page (AiTutor.tsx's GeneratingStage/SceneTimeline), ported
              // into a shared component — see LessonGeneratingView.tsx.
              // lesson.sceneProgress comes straight through from getRoom's
              // populated Course doc, same field the solo page polls.
              <LessonGeneratingView sceneProgress={lesson?.sceneProgress} />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button className={BTN_SOFT} disabled={activeLesson === 0} onClick={() => setActiveLesson(activeLesson - 1)}>
            <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
          </button>
          {!isLast ? (
            <button className={BTN_PRIMARY} onClick={() => setActiveLesson(activeLesson + 1)}>
              Next lesson <ChevronRight className="h-4 w-4" />
            </button>
          ) : course.questions?.length ? (
            <button className={BTN_PRIMARY} onClick={onQuiz}>
              <ClipboardList className="h-4 w-4" /> Take the quiz
            </button>
          ) : null}
        </div>

        {lesson?.description && (
          <div className="pt-2">
            <p className={EYEBROW}>About this lesson</p>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#B9BCCB]">{lesson.description}</p>
          </div>
        )}
      </div>

      <aside>
        <div className={cx(SURFACE, "p-3 lg:sticky lg:top-24")}>
          <p className={cx(EYEBROW, "px-2 pb-2 pt-1")}>Lessons</p>
          <ol className="relative">
            <span className="absolute bottom-5 left-[25px] top-5 w-px bg-white/[0.07]" aria-hidden="true" />
            {lessons.map((l: any, i: number) => {
              const active = i === activeLesson;
              const done = isWatched(l.lessonNumber);
              const pending = l.status !== "ready" && l.status !== "failed";
              return (
                <li key={l.lessonNumber}>
                  <button
                    onClick={() => setActiveLesson(i)}
                    className={cx("relative flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors", active ? "bg-[#8B7CFF]/[0.1]" : "hover:bg-white/[0.04]")}
                  >
                    <span className="relative z-10 shrink-0">
                      {done ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3DDC97]/15 ring-1 ring-[#3DDC97]/40"><Check className="h-3.5 w-3.5 text-[#3DDC97]" strokeWidth={3} /></span>
                      ) : pending ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#11131A] ring-1 ring-[#FF7A45]/40"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#FFB08A]" /></span>
                      ) : active ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#8B7CFF] shadow-[0_0_20px_-2px_rgba(139,124,255,0.8)]"><Play className="ml-0.5 h-3 w-3 fill-[#0A0B10] text-[#0A0B10]" /></span>
                      ) : (
                        <span className="cr-mono flex h-7 w-7 items-center justify-center rounded-full bg-[#11131A] text-[10px] text-[#8A8FA3] ring-1 ring-white/[0.12]">{pad2(i + 1)}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className={cx("line-clamp-2 text-[13px] leading-snug", active ? "font-semibold text-white" : "text-[#D6D8E2]")}>{l.title}</span>
                      {l.isRemedial && <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#FFB547]"><Sparkles className="h-3 w-3" /> Remedial</span>}
                      {l.status === "failed" && <span className="mt-0.5 block text-[11px] text-[#FF8A95]">Failed</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    </div>
  );
}

// ─── Quiz tab ────────────────────────────────────────────────────────────────

function QuizTab({ course, roomId }: { course: any; roomId: string }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);

  const questions: any[] = course.questions ?? [];

  useEffect(() => {
    getLatestAttempt(course._id)
      .then((r) => { if (r) setResult(r); })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [course._id]);

  // Keyboard: A–D / 1–4 answer, ←/→ move.
  const active = !loadingExisting && !result && questions.length > 0;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const q = questions[currentQ];
      if (!q) return;
      if (e.key === "ArrowRight") { setCurrentQ((i) => Math.min(questions.length - 1, i + 1)); return; }
      if (e.key === "ArrowLeft") { setCurrentQ((i) => Math.max(0, i - 1)); return; }
      if (e.key.length !== 1) return;
      const k = e.key.toLowerCase();
      const idx = /[1-8]/.test(k) ? Number(k) - 1 : "abcdefgh".indexOf(k);
      if (idx >= 0 && idx < q.options.length) { e.preventDefault(); setAnswers((prev) => ({ ...prev, [q.id]: idx })); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, currentQ, questions]);

  if (loadingExisting) {
    return (
      <div className="max-w-3xl space-y-4">
        <Shimmer className="h-12 w-1/2" />
        <Shimmer className="h-72 w-full" delay={0.15} />
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className={cx(SURFACE, "cr-rise flex flex-col items-center py-16 text-center")}>
        <ClipboardList className="mb-3 h-6 w-6 text-[#6E7389]" />
        <p className="cr-serif text-2xl text-white">No quiz yet</p>
        <p className="mt-1 text-sm text-[#8A8FA3]">This course doesn't have a quiz yet.</p>
      </div>
    );
  }

  if (result) {
    return (
      <QuizResultsView
        result={result}
        courseId={course._id}
        onRetake={() => { setResult(null); setAnswers({}); setCurrentQ(0); }}
      />
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = Object.entries(answers).map(([questionId, selected]) => ({ questionId: Number(questionId), selected }));
      const r = await submitQuiz(course._id, payload, roomId);
      setResult(r);
    } catch (err: any) {
      setError(err.message || "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  const q = questions[currentQ];
  const answeredCount = Object.keys(answers).length;
  const isLast = currentQ === questions.length - 1;

  return (
    <div className="cr-rise max-w-3xl space-y-6">
      <div>
        <p className={EYEBROW}>Your quiz · individual</p>
        <h2 className="cr-serif mt-2 text-3xl text-white sm:text-[40px]">Show what you know</h2>
        <p className="mt-1 text-sm text-[#8A8FA3]">{answeredCount} of {questions.length} answered · your score feeds the group dashboard</p>
      </div>

      <div className="flex gap-1">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            onClick={() => setCurrentQ(i)}
            title={`Question ${i + 1}`}
            className={cx("h-1.5 flex-1 rounded-full transition-all hover:h-2.5", i === currentQ ? "bg-[#8B7CFF]" : answers[qq.id] !== undefined ? "bg-[#3DDC97]/70" : "bg-white/[0.1]")}
          />
        ))}
      </div>

      <div key={q.id} className={cx(SURFACE, "cr-rise p-5 sm:p-8")}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-[#8B7CFF]/10 px-2.5 py-1 text-[11px] font-medium text-[#C3BAFF] ring-1 ring-[#8B7CFF]/25">{q.topic}</span>
          <span className="cr-mono text-xs text-[#6E7389]">Q{pad2(currentQ + 1)} / {pad2(questions.length)}</span>
        </div>
        <p className="cr-serif text-2xl leading-snug text-white sm:text-[30px]">{q.question}</p>
        <div className="mt-6 space-y-2.5">
          {q.options.map((opt: string, i: number) => {
            const sel = answers[q.id] === i;
            return (
              <button
                key={i}
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i }))}
                className={cx(
                  "group flex w-full items-center gap-3.5 rounded-xl p-3.5 text-left text-[14px] ring-1 transition-all sm:p-4",
                  sel ? "bg-[#8B7CFF]/[0.12] text-white ring-[#8B7CFF]" : "bg-white/[0.02] text-[#D6D8E2] ring-white/[0.08] hover:bg-white/[0.05] hover:ring-white/[0.18]"
                )}
              >
                <span className={cx("cr-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors", sel ? "bg-[#8B7CFF] text-[#0A0B10]" : "bg-white/[0.06] text-[#8A8FA3] group-hover:text-white")}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="leading-relaxed">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setCurrentQ((i) => Math.max(0, i - 1))} disabled={currentQ === 0} className={BTN_SOFT}>
          <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
        </button>
        <span className="hidden items-center gap-1.5 text-[11px] text-[#555A6E] md:inline-flex">
          <Keyboard className="h-3.5 w-3.5" /> A–D to answer · ← → to move
        </span>
        {!isLast ? (
          <button onClick={() => setCurrentQ((i) => Math.min(questions.length - 1, i + 1))} className={BTN_PRIMARY}>
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={submit} disabled={answeredCount < questions.length || submitting} className={BTN_PRIMARY}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} Submit quiz
          </button>
        )}
      </div>
      {error && <p className="flex items-center justify-center gap-1.5 text-sm text-[#FF8A95]"><AlertCircle className="h-4 w-4" /> {error}</p>}
      {isLast && answeredCount < questions.length && !error && (
        <p className="text-center text-xs text-[#FFB547]">{questions.length - answeredCount} question{questions.length - answeredCount !== 1 ? "s" : ""} still unanswered</p>
      )}
    </div>
  );
}

function QuizResultsView({ result, courseId, onRetake }: { result: QuizResult; courseId: string; onRetake: () => void }) {
  const [suggestions, setSuggestions] = useState<NextCourseSuggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const tone = readinessTone(result.pct);
  const topics = [...result.topicBreakdown].sort((a, b) => b.pct - a.pct);
  const strengths = topics.filter((t) => t.pct >= 70);
  const weaknesses = topics.filter((t) => t.pct < 70);

  return (
    <div className="cr-rise max-w-3xl space-y-5">
      <div className={cx(SURFACE, "relative overflow-hidden p-6 sm:p-8")}>
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: tone }} />
        <div className="relative flex flex-col items-center gap-7 sm:flex-row sm:gap-9">
          <Ring value={result.pct} size={152} stroke={10} color={tone}>
            <p className="cr-serif text-[56px] leading-none text-white">{result.pct}<span className="text-2xl text-[#6E7389]">%</span></p>
          </Ring>
          <div className="text-center sm:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ color: tone, background: `${tone}18` }}>
              <Trophy className="h-3.5 w-3.5" /> {result.readinessLabel}
            </span>
            <h2 className="cr-serif mt-3 text-4xl text-white">Your results</h2>
            <p className="mt-1 text-[15px] text-[#8A8FA3]">{result.score} of {result.total} correct</p>
            <div className="mt-3 space-y-1.5">
              {result.trend && (
                <p className="flex items-center justify-center gap-1.5 text-sm text-[#B9BCCB] sm:justify-start">
                  {result.trend.delta > 0 ? <ArrowUp className="h-4 w-4 text-[#3DDC97]" /> : result.trend.delta < 0 ? <ArrowDown className="h-4 w-4 text-[#FF5C6C]" /> : <Minus className="h-4 w-4 text-[#6E7389]" />}
                  {result.trend.delta > 0 ? "+" : ""}{result.trend.delta}% vs. last attempt ({result.trend.previousPct}%) · #{result.trend.attemptNumber}
                </p>
              )}
            </div>
          </div>
        </div>

        {result.roomComparison && (
          <div className="relative mt-7 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.07]">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-white"><Users className="h-3.5 w-3.5 text-[#7BE8B8]" /> You vs. the group</span>
              <span className="text-[#6E7389]">{result.roomComparison.membersReporting} reporting</span>
            </div>
            <div className="relative h-2 rounded-full bg-white/[0.06]">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${result.pct}%`, background: tone }} />
              <div className="absolute -top-1 h-4 w-0.5 rounded bg-white" style={{ left: `calc(${result.roomComparison.roomAveragePct}% - 1px)` }} title="Group average" />
            </div>
            <p className="mt-2.5 text-xs text-[#8A8FA3]">
              Group average <span className="font-semibold text-white">{result.roomComparison.roomAveragePct}%</span> —{" "}
              <span style={{ color: result.roomComparison.aboveAverage ? C.mint : C.amber }}>
                {result.roomComparison.aboveAverage ? "you're above average" : "you're below average"}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className={cx(SURFACE, "p-5 sm:p-7")}>
        <p className={EYEBROW}>Topic breakdown</p>
        <div className="mt-5 space-y-4">
          {topics.map((t) => (
            <div key={t.topic}>
              <div className="mb-1.5 flex justify-between gap-2 text-sm">
                <span className="truncate font-medium text-[#E3E5EE]">{t.topic}</span>
                <span className="cr-mono shrink-0 text-xs" style={{ color: t.pct >= 70 ? C.mint : C.rose }}>{t.correct}/{t.total} · {t.pct}%</span>
              </div>
              <Bar pct={t.pct} color={t.pct >= 70 ? C.mint : C.rose} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: "Strengths", items: strengths, color: C.mint, Icon: TrendingUp, empty: "Keep studying — strengths will emerge." },
          { title: "Needs review", items: weaknesses, color: C.rose, Icon: TrendingDown, empty: "Excellent — no weak areas." },
        ].map(({ title, items, color, Icon, empty }) => (
          <div key={title} className={cx(SURFACE, "p-5")}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color }}><Icon className="h-4 w-4" /> {title}</p>
            {items.length === 0 ? <p className="mt-3 text-sm text-[#6E7389]">{empty}</p> : (
              <ul className="mt-3 space-y-2">
                {items.map((t) => (
                  <li key={t.topic} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-[#D6D8E2]">{t.topic}</span>
                    <span className="cr-mono shrink-0 rounded-md px-1.5 py-0.5 text-[11px]" style={{ color, background: `${color}14` }}>{t.pct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {result.missedQuestions.length > 0 && (
        <div className={cx(SURFACE, "p-5 sm:p-7")}>
          <p className={EYEBROW}>Review missed questions · {result.missedQuestions.length}</p>
          <div className="mt-4 space-y-3">
            {result.missedQuestions.map((m) => (
              <div key={m.questionId} className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06]">
                <p className="text-sm font-medium leading-relaxed text-white">{m.question}</p>
                <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                  <p className="flex items-start gap-1.5 text-[#8A8FA3]"><X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF5C6C]" /><span>You: <span className="text-[#FF8A95]">{m.yourAnswer ?? "—"}</span></span></p>
                  <p className="flex items-start gap-1.5 text-[#8A8FA3]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3DDC97]" /><span>Correct: <span className="text-[#7BE8B8]">{m.correctAnswer}</span></span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onRetake} className={BTN_SOFT}><RotateCcw className="h-4 w-4" /> Retake quiz</button>
        {!suggestions && (
          <button
            className={BTN_SOFT}
            disabled={loadingSuggestions}
            onClick={() => {
              setLoadingSuggestions(true);
              getNextSuggestions(courseId).then(setSuggestions).catch(() => setSuggestions([])).finally(() => setLoadingSuggestions(false));
            }}
          >
            {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-[#B4A9FF]" />} What should I learn next?
          </button>
        )}
      </div>

      {suggestions && (
        <div className={cx(SURFACE, "relative overflow-hidden p-5 sm:p-6")}>
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-[#8B7CFF]/20 blur-3xl" />
          <p className="relative flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-[#B4A9FF]" /> Continue your journey</p>
          {suggestions.length === 0 ? (
            <p className="relative mt-3 text-sm text-[#6E7389]">Couldn't load suggestions right now.</p>
          ) : (
            <div className="relative mt-3 space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                  <p className="text-sm font-medium text-white">{s.topic}</p>
                  <p className="mt-0.5 text-xs text-[#8A8FA3]">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard tab ───────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, sub, color }: { icon: typeof Users; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={cx(SURFACE, "relative overflow-hidden p-4 sm:p-5")}>
      <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: color }} />
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}18` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <p className="relative mt-3 text-[26px] font-bold leading-none tracking-tight text-white">{value}</p>
      <p className="relative mt-1.5 text-xs text-[#8A8FA3]">{label}</p>
      {sub && <p className="relative mt-0.5 text-[11px] text-[#555A6E]">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gamified results — podium, leaderboard, "you vs the group"
//
// Everything here is derived from real DashboardMember fields the backend
// already computes (watchPct, quizPct, completedAt, quizSubmittedAt, score —
// see collabController.js's getDashboard for the score formula). No fake XP,
// no invented streaks — the "first to X" badges are genuinely first-by-
// timestamp, not a made-up speed metric this app doesn't actually measure.
// ─────────────────────────────────────────────────────────────────────────────

type Member = RoomDashboard["members"][number];

interface MemberBadges {
  firstToFinish: boolean;
  firstToQuiz: boolean;
  topScore: boolean;
}

function computeBadges(members: Member[]): Map<string, MemberBadges> {
  const map = new Map<string, MemberBadges>();
  members.forEach((m) => map.set(m.userId, { firstToFinish: false, firstToQuiz: false, topScore: false }));

  const finishers = members.filter((m) => m.completedAt).sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());
  if (finishers[0]) map.get(finishers[0].userId)!.firstToFinish = true;

  const quizzers = members.filter((m) => m.quizSubmittedAt).sort((a, b) => new Date(a.quizSubmittedAt!).getTime() - new Date(b.quizSubmittedAt!).getTime());
  if (quizzers[0]) map.get(quizzers[0].userId)!.firstToQuiz = true;

  const maxScore = Math.max(0, ...members.map((m) => m.score));
  if (maxScore > 0) members.forEach((m) => { if (m.score === maxScore) map.get(m.userId)!.topScore = true; });

  return map;
}

/** Small icon row for whatever this member earned — nothing shown if nothing did. */
function BadgeRow({ badges }: { badges?: MemberBadges }) {
  if (!badges || (!badges.firstToFinish && !badges.firstToQuiz && !badges.topScore)) return null;
  return (
    <span className="flex items-center gap-1">
      {badges.topScore && (
        <span title="Top score in the group" className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FFB547]/15"><Crown className="h-2.5 w-2.5 text-[#FFB547]" /></span>
      )}
      {badges.firstToFinish && (
        <span title="First to finish the course" className="flex h-4 w-4 items-center justify-center rounded-full bg-[#3DDC97]/15"><Flag className="h-2.5 w-2.5 text-[#3DDC97]" /></span>
      )}
      {badges.firstToQuiz && (
        <span title="First to submit the quiz" className="flex h-4 w-4 items-center justify-center rounded-full bg-[#5CE1FF]/15"><Zap className="h-2.5 w-2.5 text-[#5CE1FF]" /></span>
      )}
    </span>
  );
}

/** Podium for the top 3 by score — centre-tallest, classic 2nd/1st/3rd order. */
function Podium({ top3, meId, badgeMap }: { top3: Member[]; meId: string | null; badgeMap: Map<string, MemberBadges> }) {
  if (top3.length === 0) return null;
  // Visual order left→right is 2nd, 1st, 3rd; `top3` stays rank-ordered for
  // everything else, so this only reorders the three slots being rendered.
  const slots = [top3[1], top3[0], top3[2]].filter(Boolean) as Member[];
  const HEIGHT = { 0: 108, 1: 148, 2: 88 }; // by rank-in-top3: 1st(idx0)=148, 2nd=108, 3rd=88
  const MEDAL = [
    { icon: Crown, color: "#FFB547", bg: "#FFB547", label: "1st" },
    { icon: Medal, color: "#C7CCDC", bg: "#C7CCDC", label: "2nd" },
    { icon: Medal, color: "#FF9D6C", bg: "#FF9D6C", label: "3rd" },
  ];

  return (
    <div className={cx(SURFACE, "relative overflow-hidden p-5 sm:p-7")}>
      <span
        className="pointer-events-none absolute left-1/2 top-0 h-48 w-80 -translate-x-1/2 rounded-full opacity-20 blur-[80px]"
        style={{ background: `radial-gradient(closest-side, ${C.amber}, transparent)` }}
        aria-hidden="true"
      />
      <p className={cx(EYEBROW, "relative mb-6 text-center")}>This group's leaderboard</p>
      <div className="relative flex items-end justify-center gap-3 sm:gap-6">
        {slots.map((m) => {
          const rank = top3.findIndex((t) => t.userId === m.userId);
          const medal = MEDAL[rank];
          const Icon = medal.icon;
          const isMe = meId !== null && m.userId === meId;
          const isFirst = rank === 0;
          return (
            <div key={m.userId} className={cx("cr-pop flex flex-col items-center", isFirst ? "order-2" : rank === 1 ? "order-1" : "order-3")} style={{ animationDelay: `${rank * 0.12}s` }}>
              <Icon className={cx("mb-1.5 h-6 w-6", isFirst && "cr-crown")} style={{ color: medal.color }} />
              <div className="relative">
                <Avatar name={m.name} id={String(m.userId)} size={isFirst ? 56 : 44} ring="#11131A" />
                {isMe && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#8B7CFF] px-1.5 py-[1px] text-[8px] font-bold text-[#0A0B10]">YOU</span>}
              </div>
              <p className="mt-2.5 max-w-[84px] truncate text-center text-[12px] font-semibold text-white sm:max-w-[110px]">{m.name}</p>
              <div className="mt-0.5"><BadgeRow badges={badgeMap.get(m.userId)} /></div>
              <p className="cr-mono mt-1 text-[11px] font-semibold" style={{ color: medal.color }}>{m.score} pts</p>
              <div
                className="mt-2 flex w-16 items-start justify-center rounded-t-lg pt-2 sm:w-24"
                style={{ height: HEIGHT[rank as 0 | 1 | 2], background: `linear-gradient(180deg, ${medal.bg}22, ${medal.bg}0A)`, boxShadow: `inset 0 1px 0 ${medal.bg}55` }}
              >
                <span className="cr-mono text-lg font-bold" style={{ color: medal.color }}>{medal.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Where do I stand" — only renders when the viewer is identifiable among members. */
function YouVsGroup({ me, rank, total, avgScore }: { me: Member; rank: number; total: number; avgScore: number }) {
  const delta = me.score - avgScore;
  const leader = rank === 1;
  return (
    <div className={cx(SURFACE, "relative overflow-hidden p-5")}>
      <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-3xl" style={{ background: leader ? C.amber : C.iris }} aria-hidden="true" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} id={String(me.userId)} size={40} ring="#11131A" />
          <div>
            <p className={EYEBROW}>Your standing</p>
            <p className="cr-serif text-2xl text-white">
              {leader ? "You're in the lead" : `#${rank} of ${total}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="cr-mono text-2xl font-bold text-white">{me.score}</p>
            <p className="text-[11px] text-[#6E7389]">your score</p>
          </div>
          <div className="text-right">
            <p className="cr-mono text-2xl font-bold" style={{ color: delta >= 0 ? C.mint : C.rose }}>
              {delta > 0 ? "+" : ""}{delta}
            </p>
            <p className="text-[11px] text-[#6E7389]">vs. group avg ({avgScore})</p>
          </div>
        </div>
      </div>
      {!leader && (
        <p className="relative mt-3 text-[12px] text-[#8A8FA3]">
          Catch up on the next lesson or retake the quiz to climb past the group.
        </p>
      )}
    </div>
  );
}

/** Full ranked list, podium included — the podium is the highlight reel, this is the scoreboard. */
function Leaderboard({ ranked, meId, badgeMap }: { ranked: Member[]; meId: string | null; badgeMap: Map<string, MemberBadges> }) {
  const topScore = Math.max(1, ...ranked.map((m) => m.score));
  const RANK_STYLE = ["text-[#FFB547]", "text-[#C7CCDC]", "text-[#FF9D6C]"];
  return (
    <div className={cx(SURFACE, "p-5 sm:p-6")}>
      <div className="mb-4 flex items-center justify-between">
        <p className={EYEBROW}>Full leaderboard</p>
        <span className="flex items-center gap-1.5 text-[11px] text-[#555A6E]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3DDC97]" style={{ animation: "cr-rec 2s ease-in-out infinite" }} /> Live
        </span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {ranked.map((m, i) => {
          const isMe = meId !== null && m.userId === meId;
          return (
            <div
              key={m.userId}
              className={cx(
                "grid grid-cols-[28px_auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl px-2 py-3 sm:grid-cols-[28px_auto_minmax(0,1fr)_120px_64px] sm:gap-x-4",
                isMe && "bg-[#8B7CFF]/[0.06] ring-1 ring-[#8B7CFF]/20"
              )}
            >
              <span className={cx("cr-mono text-center text-[13px] font-bold", i < 3 ? RANK_STYLE[i] : "text-[#555A6E]")}>{i + 1}</span>
              <Avatar name={m.name} id={String(m.userId)} size={32} ring="#11131A" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                  <span className="truncate">{m.name}</span>
                  {isMe && <span className="shrink-0 rounded-full bg-[#8B7CFF]/20 px-1.5 py-[1px] text-[9px] font-bold text-[#B4A9FF]">YOU</span>}
                  <BadgeRow badges={badgeMap.get(m.userId)} />
                </p>
                <p className="mt-0.5 text-[11px] text-[#6E7389]">
                  {m.lessonsWatched}/{m.totalLessons} lessons · {m.quizSubmitted ? `quiz ${m.quizPct}%` : "no quiz yet"}
                </p>
              </div>
              <div className="col-span-3 row-start-3 sm:col-span-1 sm:row-start-auto">
                <Bar pct={(m.score / topScore) * 100} color={m.completed ? C.mint : C.iris} />
              </div>
              <p className="cr-mono justify-self-end text-right text-sm font-bold text-white">{m.score}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardTab({ roomId }: { roomId: string }) {
  const [dashboard, setDashboard] = useState<RoomDashboard | null>(null);
  const [error, setError] = useState(false);

  // Paused while the tab is hidden, same fix and same reason as
  // CourseApi.ts's pollCourse — a dashboard left open in a background tab
  // used to keep hitting the network every 8s regardless of whether anyone
  // was looking, which is exactly the kind of per-tab background work that
  // compounds into "the browser gets slow with a lot of tabs open." Catches
  // up with one immediate poll the moment the tab becomes visible again.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;
      try {
        const d = await getDashboard(roomId);
        if (!stopped) setDashboard(d);
      } catch {
        if (!stopped) setError(true);
      }
      if (!stopped) timer = setTimeout(poll, 8000);
    };
    const onVisibilityChange = () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = null;
      poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [roomId]);

  if (error && !dashboard) {
    return (
      <div className={cx(SURFACE, "cr-rise flex flex-col items-center py-16 text-center")}>
        <AlertCircle className="mb-3 h-6 w-6 text-[#FF5C6C]" />
        <p className="cr-serif text-2xl text-white">Couldn't load the dashboard</p>
        <p className="mt-1 text-sm text-[#8A8FA3]">We'll keep retrying in the background.</p>
      </div>
    );
  }
  if (!dashboard) {
    return (
      <div className="space-y-4">
        <Shimmer className="h-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-32" delay={i * 0.1} />)}</div>
        <Shimmer className="h-64" delay={0.3} />
      </div>
    );
  }

  const members = dashboard.members;
  const completed = members.filter((m) => m.completed).length;
  const avgWatch = members.length ? Math.round(members.reduce((s, m) => s + m.watchPct, 0) / members.length) : 0;
  const quizzed = members.filter((m) => m.quizSubmitted);
  const avgQuiz = quizzed.length ? Math.round(quizzed.reduce((s, m) => s + (m.quizPct ?? 0), 0) / quizzed.length) : null;
  const maxLessonReplay = Math.max(1, ...dashboard.mostReplayedLessons.map((l) => l.replayCount));
  const maxSceneReplay = Math.max(1, ...dashboard.mostReplayedScenes.map((s) => s.replayCount));

  // Ranked by score (the real competitive metric), tie-broken by who finished
  // first — two people tied on points, the one who actually got there first
  // deserves the higher spot.
  const ranked = [...members].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.completedAt && b.completedAt) return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
    return a.completedAt ? -1 : b.completedAt ? 1 : 0;
  });
  const top3 = ranked.slice(0, 3);
  const badgeMap = computeBadges(members);
  const avgScore = members.length ? Math.round(members.reduce((s, m) => s + m.score, 0) / members.length) : 0;

  // No user _id is available client-side (see SessionUser's own comment on
  // AiTutor.tsx) — email is the one identifier both this session and the
  // dashboard response reliably carry, so it's what "you" is matched on.
  let meEmail: string | null = null;
  try {
    const stored = localStorage.getItem("user");
    meEmail = stored ? JSON.parse(stored)?.email ?? null : null;
  } catch { /* malformed storage — just means "you" won't highlight */ }
  const me = meEmail ? members.find((m) => m.email?.toLowerCase() === meEmail!.toLowerCase()) ?? null : null;
  const meId = me?.userId ?? null;
  const meRank = me ? ranked.findIndex((m) => m.userId === me.userId) + 1 : 0;

  return (
    <div className="cr-rise space-y-5">
      {dashboard.room.remedialTriggered && (
        <div className="relative flex items-start gap-3 overflow-hidden rounded-2xl bg-[#FFB547]/[0.07] p-4 ring-1 ring-[#FFB547]/25">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFB547]/15"><Sparkles className="h-4 w-4 text-[#FFB547]" /></span>
          <div>
            <p className="text-sm font-semibold text-white">A remedial lesson was added for everyone</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[#E8C890]">The group reached its completion threshold, so we generated a lesson targeting the weakest shared topic. Find it in the Watch tab.</p>
          </div>
        </div>
      )}

      {members.length >= 2 && quizzed.length > 0 && <Podium top3={top3} meId={meId} badgeMap={badgeMap} />}

      {me && <YouVsGroup me={me} rank={meRank} total={ranked.length} avgScore={avgScore} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} label="Members" value={String(members.length)} color={C.iris} />
        <StatTile icon={Check} label="Completed" value={`${completed}/${members.length}`} color={C.mint} />
        <StatTile icon={Eye} label="Avg. lessons watched" value={`${avgWatch}%`} color="#5CE1FF" />
        <StatTile icon={Target} label="Avg. quiz score" value={avgQuiz === null ? "—" : `${avgQuiz}%`} sub={`${quizzed.length} submitted`} color={C.amber} />
      </div>

      <Leaderboard ranked={ranked} meId={meId} badgeMap={badgeMap} />

      <div className={cx(SURFACE, "p-5 sm:p-6")}>
        <p className={EYEBROW}>Group topic strengths & weaknesses</p>
        {dashboard.groupTopics.length === 0 ? (
          <p className="mt-4 text-sm text-[#6E7389]">No quiz attempts yet — results appear once members submit.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {[...dashboard.groupTopics].sort((a, b) => a.avgPct - b.avgPct).map((t) => (
              <div key={t.topic}>
                <div className="mb-1.5 flex justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-[#E3E5EE]">{t.topic}</span>
                  <span className="shrink-0 text-xs text-[#8A8FA3]">
                    <span className="cr-mono font-semibold" style={{ color: t.avgPct >= 70 ? C.mint : C.rose }}>{t.avgPct}%</span> avg · {t.respondents} reporting
                  </span>
                </div>
                <Bar pct={t.avgPct} color={t.avgPct >= 70 ? C.mint : C.rose} />
              </div>
            ))}
          </div>
        )}
      </div>

      {(dashboard.mostReplayedLessons.length > 0 || dashboard.mostReplayedScenes.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { title: "Most replayed lessons", icon: Film, empty: "No replays yet.", rows: dashboard.mostReplayedLessons.map((l) => ({ k: String(l.lessonNumber), label: l.title, count: l.replayCount })), max: maxLessonReplay },
            { title: "Most replayed scenes", icon: Repeat, empty: "No scene replays yet.", rows: dashboard.mostReplayedScenes.map((s, i) => ({ k: String(i), label: `${s.lessonTitle} — ${s.sceneLabel}`, count: s.replayCount })), max: maxSceneReplay },
          ].map(({ title, icon: Icon, empty, rows, max }) => (
            <div key={title} className={cx(SURFACE, "p-5 sm:p-6")}>
              <p className="flex items-center gap-2 text-sm font-semibold text-white"><Icon className="h-4 w-4 text-[#B4A9FF]" /> {title}</p>
              <p className="mt-0.5 text-[11px] text-[#555A6E]">Where the group rewinds — a hint at what's hardest.</p>
              {rows.length === 0 ? <p className="mt-4 text-sm text-[#6E7389]">{empty}</p> : (
                <ul className="mt-4 space-y-3">
                  {rows.map((r) => (
                    <li key={r.k}>
                      <div className="mb-1 flex justify-between gap-2 text-[13px]">
                        <span className="truncate text-[#D6D8E2]">{r.label}</span>
                        <span className="cr-mono shrink-0 text-[#8A8FA3]">×{r.count}</span>
                      </div>
                      <Bar pct={(r.count / max) * 100} color={C.iris} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}