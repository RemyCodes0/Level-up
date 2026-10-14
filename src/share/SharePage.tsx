// pages/SharedCoursePage.tsx
// Route: /shared/:shareToken — completely public, no login required.
// Read-only viewer: watch every lesson, take the quiz, see results.
// No sidebar, no course history, no generation UI — just the content.

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, Check, X, ClipboardList, Trophy,
  Sparkles, ArrowRight, Play, Film, RotateCcw, Keyboard, Clock,
} from "lucide-react";
import { DynamicPlayer } from "../remotion/DynamicPlayer";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface SharedLesson {
  title: string;
  description: string;
  keyPoints: string[];
  code: string | null;
  totalFrames: number | null;
}
interface SharedQuestion {
  id: number;
  question: string;
  options: string[];
  correct: number;
  topic: string;
}
interface SharedCourse {
  topic: string;
  lessons: SharedLesson[];
  questions: SharedQuestion[];
  createdAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design primitives (dark studio)
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const pad2 = (n: number) => String(n).padStart(2, "0");
const FPS = 30;
const fmtDuration = (frames: number | null) => {
  if (!frames) return null;
  const s = Math.round(frames / FPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const C = { iris: "#8B7CFF", ember: "#FF7A45", mint: "#3DDC97", amber: "#FFB547", rose: "#FF5C6C" };

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes sc-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes sc-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes sc-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
.sc-rise { animation: sc-rise .5s cubic-bezier(.2,.7,.2,1) both; }
.sc-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.sc-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.sc-noscroll::-webkit-scrollbar { display: none; } .sc-noscroll { scrollbar-width: none; }
`;

const BTN = "inline-flex items-center justify-center gap-1.5 rounded-xl h-10 px-4 text-[13px] font-medium transition-all disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]/60";
const BTN_SOFT = `${BTN} text-[#E3E5EE] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.09]`;
const BTN_PRIMARY = `${BTN} font-semibold text-[#0A0B10] bg-[#8B7CFF] hover:bg-[#A093FF] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)]`;
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]";
const SURFACE = "rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden" aria-hidden="true">
        <div className="absolute -top-56 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-25 blur-[110px]" style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }} />
        <div className="absolute -right-40 top-24 h-[340px] w-[440px] rounded-full opacity-[0.12] blur-[110px]" style={{ background: `radial-gradient(closest-side, ${C.ember}, transparent)` }} />
        <div className="sc-grain absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0A0B10]" />
      </div>
      <div className="relative">{children}</div>
    </div>
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

function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="relative shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="Level Up" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
    </span>
  );
}

function readinessTone(pct: number) {
  if (pct >= 85) return { color: C.mint, label: "Exam Ready" };
  if (pct >= 70) return { color: C.iris, label: "Almost Ready" };
  if (pct >= 55) return { color: C.amber, label: "Needs Review" };
  return { color: C.rose, label: "Needs Practice" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SharedCoursePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<SharedCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLesson, setActiveLesson] = useState(0);
  const [section, setSection] = useState<"video" | "quiz" | "results">("video");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [watched, setWatched] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`${BASE_URL}/api/course/shared/${shareToken}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "This shared course wasn't found, or is no longer being shared." : "Something went wrong loading this course.");
        return r.json();
      })
      .then(setCourse)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [shareToken]);

  // Quiz keyboard: A–D / 1–4 answer, ←/→ move.
  const quizActive = section === "quiz" && !quizSubmitted && !!course?.questions.length;
  useEffect(() => {
    if (!quizActive || !course) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const q = course.questions[currentQ];
      if (!q) return;
      if (e.key === "ArrowRight") { setCurrentQ((i) => Math.min(course.questions.length - 1, i + 1)); return; }
      if (e.key === "ArrowLeft") { setCurrentQ((i) => Math.max(0, i - 1)); return; }
      if (e.key.length !== 1) return;
      const k = e.key.toLowerCase();
      const idx = /[1-8]/.test(k) ? Number(k) - 1 : "abcdefgh".indexOf(k);
      if (idx >= 0 && idx < q.options.length) { e.preventDefault(); setAnswers((prev) => ({ ...prev, [q.id]: idx })); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quizActive, course, currentQ]);

  if (loading) {
    return (
      <Shell>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <Logo size={40} />
          <Loader2 className="h-5 w-5 animate-spin text-[#8B7CFF]" />
        </div>
      </Shell>
    );
  }

  if (error || !course) {
    return (
      <Shell>
        <div className="sc-rise flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF5C6C]/10 ring-1 ring-[#FF5C6C]/30">
            <AlertCircle className="h-6 w-6 text-[#FF5C6C]" />
          </div>
          <h1 className="sc-serif text-4xl text-white">Can't load this course</h1>
          <p className="mt-2 max-w-sm text-sm text-[#8A8FA3]">{error}</p>
          <button onClick={() => navigate("/")} className={cx(BTN_PRIMARY, "mt-7 h-11 px-5")}>
            Go to Level Up <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Shell>
    );
  }

  const lesson = course.lessons[activeLesson];
  const hasQuiz = course.questions.length > 0;
  const score = quizSubmitted ? course.questions.filter((q) => answers[q.id] === q.correct).length : 0;
  const pct = course.questions.length ? Math.round((score / course.questions.length) * 100) : 0;
  const answeredCount = Object.keys(answers).length;
  const inQuiz = section === "quiz" || section === "results";

  const openLesson = (i: number) => { setActiveLesson(i); setSection("video"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openQuiz = () => { setSection("quiz"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const retake = () => { setAnswers({}); setQuizSubmitted(false); setCurrentQ(0); };

  return (
    <Shell>
      <Helmet>
        <title>{course.topic} — Shared Course | Level Up AI</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0A0B10]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button onClick={() => navigate("/")} className="flex min-w-0 items-center gap-2.5">
            <Logo />
            <span className="sc-serif hidden text-xl text-white sm:inline">Level Up</span>
          </button>
          <button onClick={() => navigate("/signup")} className={cx(BTN_PRIMARY, "h-9 px-3.5 text-xs sm:text-[13px]")}>
            <Sparkles className="h-3.5 w-3.5" /> Make your own <ArrowRight className="hidden h-3.5 w-3.5 sm:block" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {/* Course hero */}
        <div className="sc-rise mb-8 sm:mb-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[#B9BCCB] ring-1 ring-white/[0.08]">
            <Film className="h-3 w-3 text-[#B4A9FF]" /> Shared course
          </span>
          <h1 className="sc-serif mt-4 max-w-4xl text-[38px] leading-[1.04] text-white sm:text-[60px]">{course.topic}</h1>
          <p className="mt-3 text-sm text-[#8A8FA3]">
            {course.lessons.length} animated lesson{course.lessons.length !== 1 ? "s" : ""}
            {hasQuiz && <> · {course.questions.length}-question quiz</>}
            {" · "}made with Level Up AI
          </p>
        </div>

        {/* Mobile chapter strip */}
        <div className="sc-noscroll -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 lg:hidden">
          {course.lessons.map((l, i) => {
            const active = section === "video" && activeLesson === i;
            return (
              <button
                key={i}
                onClick={() => openLesson(i)}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ring-1 transition-all",
                  active ? "bg-[#8B7CFF]/[0.14] text-white ring-[#8B7CFF]" : "bg-white/[0.03] text-[#B9BCCB] ring-white/[0.08]"
                )}
              >
                <span className={cx("font-mono text-[10px]", watched.has(i) ? "text-[#3DDC97]" : active ? "text-[#B4A9FF]" : "text-[#6E7389]")}>
                  {watched.has(i) ? <Check className="h-3 w-3" strokeWidth={3} /> : pad2(i + 1)}
                </span>
                <span className="max-w-[160px] truncate">{l.title}</span>
              </button>
            );
          })}
          {hasQuiz && (
            <button
              onClick={openQuiz}
              className={cx(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ring-1 transition-all",
                inQuiz ? "bg-[#8B7CFF]/[0.14] text-white ring-[#8B7CFF]" : "bg-white/[0.03] text-[#B9BCCB] ring-white/[0.08]"
              )}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Quiz
            </button>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          {/* Main column */}
          <div className="min-w-0">
            {section === "video" && lesson && (
              <div key={activeLesson} className="sc-rise space-y-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className={EYEBROW}>Lesson {pad2(activeLesson + 1)} <span className="text-[#3E4253]">/ {pad2(course.lessons.length)}</span></p>
                    <h2 className="sc-serif mt-2 text-3xl leading-[1.08] text-white sm:text-[40px]">{lesson.title}</h2>
                  </div>
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute -inset-6 rounded-[32px] opacity-40 blur-3xl" style={{ background: `radial-gradient(60% 60% at 50% 40%, ${C.iris}33, transparent)` }} />
                  <div className="relative overflow-hidden rounded-2xl shadow-[0_40px_100px_-40px_rgba(0,0,0,1)] ring-1 ring-white/[0.08]">
                    {lesson.code ? (
                      <DynamicPlayer
                        code={lesson.code}
                        durationInFrames={lesson.totalFrames ?? 3600}
                        onEnded={() => setWatched((prev) => new Set(prev).add(activeLesson))}
                      />
                    ) : (
                      <div className="sc-grain flex aspect-video flex-col items-center justify-center gap-2 bg-[#07080C] text-center">
                        <Film className="h-6 w-6 text-[#3E4253]" />
                        <p className="text-sm text-[#8A8FA3]">This lesson isn't available.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button disabled={activeLesson === 0} onClick={() => setActiveLesson((i) => i - 1)} className={BTN_SOFT}>
                    <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
                  </button>
                  {activeLesson < course.lessons.length - 1 ? (
                    <button onClick={() => setActiveLesson((i) => i + 1)} className={BTN_PRIMARY}>
                      Next lesson <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : hasQuiz ? (
                    <button onClick={openQuiz} className={BTN_PRIMARY}>
                      <ClipboardList className="h-4 w-4" /> Take the quiz
                    </button>
                  ) : null}
                </div>

                <section className="grid gap-6 pt-2 md:grid-cols-[1fr_1.4fr]">
                  {lesson.description && (
                    <div>
                      <p className={EYEBROW}>About this lesson</p>
                      <p className="mt-3 text-[15px] leading-relaxed text-[#B9BCCB]">{lesson.description}</p>
                    </div>
                  )}
                  {lesson.keyPoints.filter(Boolean).length > 0 && (
                    <div className={cx(!lesson.description && "md:col-span-2")}>
                      <p className={EYEBROW}>Key points</p>
                      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                        {lesson.keyPoints.filter(Boolean).map((pt, i) => (
                          <li key={i} className={cx(SURFACE, "flex gap-3 p-3.5")}>
                            <span className="font-mono text-[11px] font-semibold text-[#8B7CFF]">{pad2(i + 1)}</span>
                            <span className="text-[13px] leading-relaxed text-[#E3E5EE]">{pt}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Quiz — one question at a time */}
            {section === "quiz" && !quizSubmitted && hasQuiz && (() => {
              const q = course.questions[currentQ];
              const isLast = currentQ === course.questions.length - 1;
              return (
                <div className="sc-rise space-y-6">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className={EYEBROW}>Quiz</p>
                      <h2 className="sc-serif mt-2 text-3xl text-white sm:text-[40px]">Test what you just learned</h2>
                      <p className="mt-1 text-sm text-[#8A8FA3]">{answeredCount} of {course.questions.length} answered</p>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    {course.questions.map((qq, i) => (
                      <button
                        key={qq.id}
                        onClick={() => setCurrentQ(i)}
                        title={`Question ${i + 1}`}
                        className={cx("h-1.5 flex-1 rounded-full transition-all hover:h-2.5", i === currentQ ? "bg-[#8B7CFF]" : answers[qq.id] !== undefined ? "bg-[#3DDC97]/70" : "bg-white/[0.1]")}
                      />
                    ))}
                  </div>

                  <div key={q.id} className={cx(SURFACE, "sc-rise p-5 sm:p-8")}>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-[#8B7CFF]/10 px-2.5 py-1 text-[11px] font-medium text-[#C3BAFF] ring-1 ring-[#8B7CFF]/25">{q.topic}</span>
                      <span className="font-mono text-xs text-[#6E7389]">Q{pad2(currentQ + 1)} / {pad2(course.questions.length)}</span>
                    </div>
                    <p className="sc-serif text-2xl leading-snug text-white sm:text-[30px]">{q.question}</p>
                    <div className="mt-6 space-y-2.5">
                      {q.options.map((opt, i) => {
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
                            <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold transition-colors", sel ? "bg-[#8B7CFF] text-[#0A0B10]" : "bg-white/[0.06] text-[#8A8FA3] group-hover:text-white")}>
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
                      <button onClick={() => setCurrentQ((i) => Math.min(course.questions.length - 1, i + 1))} className={BTN_PRIMARY}>
                        Next <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={() => { setQuizSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={answeredCount < course.questions.length} className={BTN_PRIMARY}>
                        <Trophy className="h-4 w-4" /> Submit quiz
                      </button>
                    )}
                  </div>
                  {isLast && answeredCount < course.questions.length && (
                    <p className="text-center text-xs text-[#FFB547]">
                      {course.questions.length - answeredCount} question{course.questions.length - answeredCount !== 1 ? "s" : ""} still unanswered
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Results */}
            {section === "quiz" && quizSubmitted && (() => {
              const tone = readinessTone(pct);
              return (
                <div className="sc-rise space-y-6">
                  <div className={cx(SURFACE, "relative overflow-hidden p-6 sm:p-9")}>
                    <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: tone.color }} />
                    <div className="relative flex flex-col items-center gap-7 sm:flex-row sm:gap-10">
                      <Ring value={pct} size={160} stroke={10} color={tone.color}>
                        <p className="sc-serif text-6xl leading-none text-white">{pct}<span className="text-3xl text-[#6E7389]">%</span></p>
                      </Ring>
                      <div className="text-center sm:text-left">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ color: tone.color, background: `${tone.color}18` }}>
                          <Trophy className="h-3.5 w-3.5" /> {tone.label}
                        </span>
                        <h2 className="sc-serif mt-3 text-4xl text-white sm:text-5xl">Nicely done.</h2>
                        <p className="mt-1.5 text-[15px] text-[#8A8FA3]">{score} of {course.questions.length} answered correctly</p>
                        <button onClick={retake} className={cx(BTN_SOFT, "mt-5")}>
                          <RotateCcw className="h-4 w-4" /> Retake quiz
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={cx(SURFACE, "p-5 sm:p-7")}>
                    <p className={EYEBROW}>Answer review</p>
                    <div className="mt-4 space-y-2.5">
                      {course.questions.map((q, i) => {
                        const right = answers[q.id] === q.correct;
                        return (
                          <div key={q.id} className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06]">
                            <div className="flex items-start gap-3">
                              <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", right ? "bg-[#3DDC97]/15" : "bg-[#FF5C6C]/15")}>
                                {right ? <Check className="h-3.5 w-3.5 text-[#3DDC97]" strokeWidth={3} /> : <X className="h-3.5 w-3.5 text-[#FF5C6C]" strokeWidth={3} />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-relaxed text-white"><span className="mr-1.5 font-mono text-xs text-[#6E7389]">{pad2(i + 1)}</span>{q.question}</p>
                                {!right && (
                                  <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                                    <p className="text-[#8A8FA3]">You: <span className="text-[#FF8A95]">{q.options[answers[q.id]] ?? "No answer"}</span></p>
                                    <p className="text-[#8A8FA3]">Correct: <span className="text-[#7BE8B8]">{q.options[q.correct]}</span></p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <CtaCard onClick={() => navigate("/signup")} />
                </div>
              );
            })()}
          </div>

          {/* Desktop syllabus */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <div className={cx(SURFACE, "p-3")}>
                <p className={cx(EYEBROW, "px-2 pb-2 pt-1")}>Syllabus</p>
                <ol className="relative">
                  <span className="absolute bottom-5 left-[25px] top-5 w-px bg-white/[0.07]" aria-hidden="true" />
                  {course.lessons.map((l, i) => {
                    const active = section === "video" && activeLesson === i;
                    const done = watched.has(i);
                    const dur = fmtDuration(l.totalFrames);
                    return (
                      <li key={i}>
                        <button
                          onClick={() => openLesson(i)}
                          className={cx("relative flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors", active ? "bg-[#8B7CFF]/[0.1]" : "hover:bg-white/[0.04]")}
                        >
                          <span className="relative z-10 shrink-0">
                            {done ? (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3DDC97]/15 ring-1 ring-[#3DDC97]/40"><Check className="h-3.5 w-3.5 text-[#3DDC97]" strokeWidth={3} /></span>
                            ) : active ? (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#8B7CFF] shadow-[0_0_20px_-2px_rgba(139,124,255,0.8)]"><Play className="ml-0.5 h-3 w-3 fill-[#0A0B10] text-[#0A0B10]" /></span>
                            ) : (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#11131A] font-mono text-[10px] text-[#8A8FA3] ring-1 ring-white/[0.12]">{pad2(i + 1)}</span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1 pt-0.5">
                            <span className={cx("line-clamp-2 text-[13px] leading-snug", active ? "font-semibold text-white" : "text-[#D6D8E2]")}>{l.title}</span>
                            {dur && <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#6E7389]"><Clock className="h-3 w-3" /> {dur}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {hasQuiz && (
                  <button
                    onClick={openQuiz}
                    className={cx("mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors", inQuiz ? "bg-[#8B7CFF]/[0.1]" : "hover:bg-white/[0.04]")}
                  >
                    <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1", quizSubmitted ? "bg-[#3DDC97]/10 ring-[#3DDC97]/30" : "bg-white/[0.03] ring-white/[0.1]")}>
                      {quizSubmitted ? <Trophy className="h-3.5 w-3.5 text-[#FFB547]" /> : <ClipboardList className="h-3.5 w-3.5 text-[#B9BCCB]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-white">Final quiz</span>
                      <span className="block text-[11px] text-[#6E7389]">{quizSubmitted ? `Scored ${pct}%` : `${course.questions.length} questions`}</span>
                    </span>
                  </button>
                )}
              </div>
              <CtaCard compact onClick={() => navigate("/signup")} />
            </div>
          </aside>
        </div>
      </main>
    </Shell>
  );
}

function CtaCard({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <div className={cx("relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#8B7CFF]/[0.16] via-[#11131A] to-[#FF7A45]/[0.1] ring-1 ring-white/[0.08]", compact ? "p-5" : "p-7 text-center sm:p-10")}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#8B7CFF]/25 blur-3xl" />
      <div className={cx("relative", !compact && "mx-auto max-w-md")}>
        <Sparkles className={cx("h-5 w-5 text-[#B4A9FF]", !compact && "mx-auto")} />
        <p className={cx("sc-serif mt-3 leading-tight text-white", compact ? "text-2xl" : "text-3xl sm:text-4xl")}>Want a course like this on your own topic?</p>
        <p className="mt-2 text-xs text-[#8A8FA3] sm:text-sm">Type any subject or upload your notes. 100 free credits when you sign up — no card required.</p>
        <button onClick={onClick} className={cx(BTN_PRIMARY, "mt-5 h-11 px-5", compact && "w-full")}>
          Start free <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}