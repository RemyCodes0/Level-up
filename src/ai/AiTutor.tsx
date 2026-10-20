"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { ReactNode, CSSProperties } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Thumbnail } from "@remotion/player";
import { PDFDocument } from "pdf-lib";
import {
  startCourseGeneration,
  pollCourse,
  listCourses,
  deleteCourse,
  retryLesson,
  retryScene,
  RetrySceneError,
  unlockCourse,
  getCourseStatus,
  getNextSuggestions,
  getPricingConfig,
  getCourseLineage,
  regenerateQuiz,
} from "../api/CourseApi";
import type { CourseFromAPI, NextCourseSuggestion, SceneProgressItem, SceneMetaItem, CourseTier } from "../api/CourseApi";
import { getProgress, markLessonWatched, logPosition } from "../api/ProgressApi";
import { submitQuiz as submitQuizApi, getLatestAttempt, getAttemptHistory } from "../api/QuizApi";
import type { QuizResult } from "../api/QuizApi";
import { LevelAssessmentChat } from "../components/LevelAssessmentChat";
import { DynamicPlayer, PlayerErrorBoundary } from "../remotion/DynamicPlayer";
import type { LessonCrashInfo } from "../remotion/DynamicPlayer";
import { useCompilation } from "../remotion/useCompilation";
import { ReferralCard } from "../components/ReferralCard";
import { FeedbackModal } from "../feedback/FeedBackModel";
import { ShareModal } from "../components/ShareModal";
import { PublishModal } from "../components/PublishModal";
import { analytics, resetUser } from "../lib/analytics";
import {
  FileText, Play, CheckCircle2, Lock, Sparkles, ChevronRight, ChevronLeft, Clock, AlertCircle,
  TrendingUp, TrendingDown, ClipboardList, Trophy, X, Check, PanelLeft, PanelRight, Plus,
  GraduationCap, Loader2, Trash2, XCircle, Zap, MessageSquare, Share2, Globe2,
  User as UserIcon, LogOut, ChevronsUpDown, Search, Gift, Paperclip, ArrowUp, ArrowRight,
  Menu, Film, Mic, Wand2, Target, Keyboard, RotateCcw, Users, CornerDownRight,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Config (unchanged semantics)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// No payment processor is live yet — the paywall points to the WhatsApp community.
const WHATSAPP_COMMUNITY_URL = "https://chat.whatsapp.com/CyuV45KQ9Au3awigE39jBC";

const HISTORY_PAGE_SIZE = 8;
const MAX_PAGES = 100;

const PROGRESS_DURATION_MS = 6 * 60 * 1000;
const PROGRESS_TICK_MS = 300;
const PROGRESS_MAX = 99;

const UP_NEXT_THRESHOLD_SEC = 5;
const AUTO_ADVANCE_SECONDS = 10;
const FPS = 30;
const POSITION_REPORT_INTERVAL_MS = 5000;

const GENERATION_PHASES = ["Planning the scenes…", "Writing narration…", "Recording the voiceover…", "Animating the lesson…"];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppPhase = "upload" | "assessment" | "course";
type CourseSection = "video" | "quiz" | "results";
type LessonStatus = "ready" | "generating" | "failed" | "locked";
type Level = "beginner" | "intermediate" | "advanced" | null;
type SessionUser = { name: string; email: string; role?: string } | null;

interface HistoryEntry {
  id: string;
  fileName: string;
  createdAt: Date;
  completedLessons: number;
  quizScore: number | null;
  lessons: Lesson[];
  lessonStatuses: LessonStatus[];
  quizAnswers: QuizAnswer[];
  quizDone: boolean;
  questions: MCQQuestion[];
  isFreeTrialCourse?: boolean;
  // Learning-loop lineage (persisted server-side, so it survives a reload and
  // can be drawn in the library rail). null for a composer-started course.
  parentCourseId?: string | null;
  followUpKind?: "repair" | "extend" | null;
  // The course's own status. NOT derivable from lessonStatuses: the quiz is
  // written after every lesson finishes, so "all lessons ready" and "course
  // finished" are different states, and the gap between them is exactly when
  // the quiz is being generated.
  status?: "generating" | "ready" | "failed";
  // Questions this course's tier promised — the quiz count to show before any
  // question exists (the old hardcoded 20 was wrong for every other tier).
  mcqCount?: number;
  // Credits this course cost, from its own tier snapshot — shown on a
  // follow-up card so the spend stays visible after the fact.
  creditCost?: number;
  // Server-graded quiz result (score never trusted from the client).
  serverQuizResult?: QuizResult | null;
  // Tier snapshot's quiz time allocation (minutes). Defaults to 30.
  timeAllocationMinutes?: number;
}

interface Lesson {
  id: number;
  title: string;
  completed: boolean;
  description: string;
  keyPoints: string[];
  videoUrl?: string | null;
  code?: string | null;
  totalFrames?: number | null;
  error?: string | null;
  sceneProgress?: SceneProgressItem[];
  scenes?: SceneMetaItem[];
}

interface MCQQuestion {
  id: number;
  question: string;
  options: string[];
  correct: number;
  topic: string;
}

interface QuizAnswer {
  questionId: number;
  selected: number;
}

interface Credits {
  courseCredits: number;
  canGenerate: boolean;
  spendableBalance?: number;
  signupBonusCredits?: number;
  signupBonusExpiresAt?: string | null;
  feedbackCreditGranted?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const cleanName = (n: string) => n.replace(/\.(pdf|pptx)$/i, "");
const pad2 = (n: number) => String(n).padStart(2, "0");
const isPlaceholderPoint = (p: string) => !p || p === "Loading…";

const mapStatus = (s?: string): LessonStatus =>
  s === "ready" ? "ready" : s === "failed" ? "failed" : s === "locked" ? "locked" : "generating";

type ApiLesson = CourseFromAPI["lessons"][number];

// Same merge every poll callback used to inline.
function mergeLesson(l: Lesson, a: ApiLesson | undefined): Lesson {
  if (!a) return l;
  return {
    ...l,
    title: a.title ?? l.title,
    description: a.description ?? l.description,
    keyPoints: a.keyPoints?.length ? a.keyPoints : l.keyPoints,
    videoUrl: a.videoUrl,
    code: a.code ?? l.code,
    totalFrames: a.totalFrames ?? l.totalFrames,
    sceneProgress: a.sceneProgress ?? l.sceneProgress,
    // FIX: missing here meant a lesson that finished generating during a
    // LIVE poll (no page reload) never got its scene/narration data into
    // local state — the player's captionsAvailable check always saw
    // undefined, so the CC button silently never appeared until the next
    // full reload re-fetched the course from scratch (which builds Lesson[]
    // straight from the API response, scenes included).
    scenes: a.scenes ?? l.scenes,
    error: a.error ?? null,
  };
}

// Real runtime of a lesson, read off the same frame count the player uses.
// null while the lesson is still generating (no frame count yet).
function lessonDuration(lesson: Lesson): string | null {
  if (!lesson.totalFrames || lesson.totalFrames <= 0) return null;
  const seconds = Math.round(lesson.totalFrames / FPS);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function buildMockLessons(count: number = 6): Lesson[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Lesson ${i + 1}`,
    completed: false,
    description: i === 0 ? "Generating your first lesson…" : "Generating…",
    keyPoints: ["Loading…", "Loading…", "Loading…", "Loading…"],
    videoUrl: null,
    code: null,
    totalFrames: null,
  }));
}
const MOCK_LESSONS: Lesson[] = buildMockLessons(6);
const MOCK_QUESTIONS: MCQQuestion[] = [];

// Real progress: half audio, half code, credited per scene as each flag flips.
// null = no scene plan yet (caller falls back to the simulated timer).
function computeRealLessonProgress(sceneProgress: SceneProgressItem[] | undefined): number | null {
  if (!sceneProgress || sceneProgress.length === 0) return null;
  const total = sceneProgress.length;
  const audioReadyCount = sceneProgress.filter((s) => s.audioReady).length;
  const codeReadyCount = sceneProgress.filter((s) => s.codeReady).length;
  return (audioReadyCount / total) * 50 + (codeReadyCount / total) * 50;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

function useLessonProgress(statuses: LessonStatus[], sceneProgresses: (SceneProgressItem[] | undefined)[]): number[] {
  const [progresses, setProgresses] = useState<number[]>(statuses.map(() => 0));
  const startTimesRef = useRef<(number | null)[]>(statuses.map(() => null));
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusKey = statuses.join(",");
  // Keyed on ready COUNTS, not array identity — pollCourse returns fresh arrays every tick.
  const sceneProgressKey = sceneProgresses
    .map((sp) => (sp ? `${sp.filter((s) => s.audioReady).length}:${sp.filter((s) => s.codeReady).length}` : "-"))
    .join(",");

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    setProgresses((prev) => {
      const next = [...prev];
      statuses.forEach((s, i) => {
        if (s === "ready") next[i] = 100;
        if (s === "failed") { next[i] = 0; startTimesRef.current[i] = null; }
        if (s === "generating") {
          const real = computeRealLessonProgress(sceneProgresses[i]);
          if (real !== null) next[i] = real;
        }
      });
      return next;
    });

    // Simulated timer only covers the pre-scene-plan window of the first generating lesson.
    const activeIdx = statuses.findIndex((s) => s === "generating");
    if (activeIdx === -1) return;
    if (computeRealLessonProgress(sceneProgresses[activeIdx]) !== null) return;

    if (startTimesRef.current[activeIdx] === null) {
      startTimesRef.current[activeIdx] = Date.now();
    }
    tickRef.current = setInterval(() => {
      const start = startTimesRef.current[activeIdx];
      if (start === null) return;
      const fraction = Math.min((Date.now() - start) / PROGRESS_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - fraction, 3);
      const pct = Math.min(eased * PROGRESS_MAX, PROGRESS_MAX);
      setProgresses((prev) => {
        if (statuses[activeIdx] !== "generating") return prev;
        const next = [...prev];
        next[activeIdx] = pct;
        return next;
      });
    }, PROGRESS_TICK_MS);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [statusKey, sceneProgressKey]);

  return progresses;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design system — "Studio": ink surfaces, iris accent, ember for live/recording
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  iris: "#8B7CFF",
  ember: "#FF7A45",
  mint: "#3DDC97",
  amber: "#FFB547",
  rose: "#FF5C6C",
};

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap";

const STUDIO_CSS = `
@keyframes lu-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes lu-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes lu-wave { 0%,100% { transform: scaleY(.22); } 50% { transform: scaleY(1); } }
@keyframes lu-frame { 0%,100% { opacity: .3; } 50% { opacity: 1; } }
@keyframes lu-rec { 0%,100% { opacity: 1; } 50% { opacity: .2; } }
@keyframes lu-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes lu-scan { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
.lu-rise { animation: lu-rise .55s cubic-bezier(.2,.7,.2,1) both; }
.lu-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.lu-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.lu-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.1) transparent; }
.lu-scroll::-webkit-scrollbar { width: 8px; }
.lu-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 8px; }
`;

function StudioStyles() {
  return (
    <>
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{STUDIO_CSS}</style>
    </>
  );
}

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-xl h-10 px-4 text-[13px] font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]/60";
const BTN_GHOST = `${BTN_BASE} text-[#B9BCCB] hover:text-white hover:bg-white/[0.06]`;
const BTN_SOFT = `${BTN_BASE} text-[#E3E5EE] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.09] hover:ring-white/[0.14]`;
const BTN_PRIMARY = `${BTN_BASE} font-semibold text-[#0A0B10] bg-[#8B7CFF] hover:bg-[#A093FF] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)]`;
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]";
const SURFACE = "rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]";

function Ring({
  value, size = 44, stroke = 4, color = C.iris, track = "rgba(255,255,255,0.08)", children,
}: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(Math.max(value, 0), 100) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1), stroke .3s" }}
        />
      </svg>
      {children != null && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

function Shimmer({ className, style, delay = 0 }: { className?: string; style?: CSSProperties; delay?: number }) {
  return (
    <div
      className={cx("rounded-md bg-white/[0.05]", className)}
      style={{
        ...style,
        backgroundImage: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.09) 50%, transparent 65%)",
        backgroundSize: "250% 100%",
        animation: "lu-sweep 1.7s ease-in-out infinite",
        animationDelay: `${delay}s`,
      }}
    />
  );
}

function RecDot({ color = C.ember }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inset-0 rounded-full" style={{ background: color, animation: "lu-rec 1.4s ease-in-out infinite" }} />
      <span className="absolute -inset-1 rounded-full opacity-30 blur-[3px]" style={{ background: color }} />
    </span>
  );
}

function Logo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[10px] ring-1 ring-white/10 bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45]"
      style={{ width: size, height: size }}
    >
      <img src="/logo.png" alt="Level Up" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
    </div>
  );
}

function Aurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -top-40 left-1/2 h-[560px] w-[760px] -translate-x-1/2 rounded-full opacity-[0.35] blur-[110px]"
        style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }}
      />
      <div
        className="absolute top-1/3 -right-40 h-[420px] w-[520px] rounded-full opacity-[0.18] blur-[110px]"
        style={{ background: `radial-gradient(closest-side, ${C.ember}, transparent)` }}
      />
      <div className="absolute inset-0 lu-grain opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#0A0B10_85%)]" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Paywall
// ─────────────────────────────────────────────────────────────────────────────

function PaywallModal({ onClose }: { onClose: () => void; courseId?: string | null; courseName?: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="lu-rise relative w-full max-w-md overflow-hidden rounded-3xl bg-[#12141B] p-7 text-[#ECEDF2] shadow-2xl ring-1 ring-white/10"
      >
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#3DDC97]/20 blur-3xl" />
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-[#6E7389] transition-colors hover:bg-white/5 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3DDC97]/10 ring-1 ring-[#3DDC97]/30">
          <MessageSquare className="h-5 w-5 text-[#3DDC97]" />
        </div>
        <h2 className="lu-serif mt-5 text-[32px] leading-tight">Running low on credits?</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">
          We're not selling credit packs directly just yet. Join the Level Up WhatsApp community, send us a message, and we'll top you up.
        </p>
        <a
          href={WHATSAPP_COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3DDC97] text-sm font-semibold text-[#06130D] transition-all hover:brightness-110"
        >
          Join the WhatsApp community <ArrowRight className="h-4 w-4" />
        </a>
        <p className="mt-4 text-center text-xs text-[#6E7389]">Your 100 signup credits and referral earnings stay yours in the meantime.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer (new course) + format picker
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTIONS = ["Cell Biology lecture slides", "Calculus II integration techniques", "Data structures & algorithms", "Electromagnetic waves"];

function Composer({ onGenerate, credits, courseTiers, onRequestTopUp }: {
  onGenerate: (fileName: string, file?: File | null, tier?: string | null) => void;
  credits: Credits | null;
  courseTiers: CourseTier[] | null;
  onRequestTopUp: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [checkingPages, setCheckingPages] = useState(false);
  const [pageCountError, setPageCountError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const locked = !!(credits && !credits.canGenerate);

  // Every generation requires picking a tier first (no free trial since 2026-08-21).
  const [pendingSubmission, setPendingSubmission] = useState<{ name: string; file: File | null } | null>(null);
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);
  const spendableBalance = credits?.spendableBalance ?? credits?.courseCredits ?? 0;
  const selectedTier = courseTiers?.find((t) => t.key === selectedTierKey) ?? null;

  const handleFile = async (file: File) => {
    if (locked) return;
    if (!(file.type === "application/pdf" || file.name.endsWith(".pptx"))) return;

    setUploadedFile(file);
    analytics.pdfUploaded();
    setPageCount(null);
    setPageCountError(null);

    if (file.type !== "application/pdf") return;

    setCheckingPages(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      setPageCount(pdf.getPageCount());
    } catch (err) {
      console.error("Failed to read PDF page count:", err);
      setPageCountError("Couldn't read this PDF's page count — it may be corrupted or encrypted.");
    } finally {
      setCheckingPages(false);
    }
  };
  const exceedsPageLimit = pageCount !== null && pageCount > MAX_PAGES;

  const clearFile = () => { setUploadedFile(null); setPageCount(null); setPageCountError(null); };

  const handleSubmit = () => {
    if (locked || exceedsPageLimit) return;
    if (!uploadedFile && !inputValue.trim()) return;
    const name = uploadedFile ? uploadedFile.name : inputValue.trim();
    setSelectedTierKey(null);
    setPendingSubmission({ name, file: uploadedFile });
  };
  const handleConfirmTier = () => {
    if (!pendingSubmission || !selectedTier) return;
    onGenerate(pendingSubmission.name, pendingSubmission.file, selectedTier.key);
    setPendingSubmission(null);
    setSelectedTierKey(null);
  };
  const cancelTier = () => { setPendingSubmission(null); setSelectedTierKey(null); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (locked) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [inputValue]);

  // Picks up a topic typed into the landing page hero (see Landing.tsx).
  useEffect(() => {
    const pending = localStorage.getItem("levelup_pending_prompt");
    if (!pending) return;
    localStorage.removeItem("levelup_pending_prompt");
    setInputValue(pending);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const canSubmit = !locked && !exceedsPageLimit && !checkingPages && (!!uploadedFile || inputValue.trim().length > 0);

  return (
    <div className="relative min-h-full">
      <Aurora />
      <div className="relative mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-14 sm:px-6 sm:py-20">
        {pendingSubmission ? (
          <FormatPicker
            topic={pendingSubmission.name}
            tiers={courseTiers}
            balance={spendableBalance}
            selectedKey={selectedTierKey}
            onSelect={setSelectedTierKey}
            onConfirm={handleConfirmTier}
            onBack={cancelTier}
            onRequestTopUp={onRequestTopUp}
          />
        ) : (
          <>
            <div className="lu-rise mb-9 text-center sm:mb-11">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#B9BCCB] ring-1 ring-white/[0.08]">
                <RecDot /> AI course studio
              </span>
              <h1 className="lu-serif mt-6 text-[42px] leading-[1.02] text-white sm:text-[68px]">
                What do you want to{" "}
                <span className="italic bg-gradient-to-r from-[#C3BAFF] via-[#8B7CFF] to-[#FF7A45] bg-clip-text text-transparent">master</span>{" "}
                next?
              </h1>
              <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-[#8A8FA3]">
                Describe a topic or drop in your lecture notes. We script, narrate and animate a full video course — then quiz you on it.
              </p>
            </div>

            <div
              className="lu-rise"
              style={{ animationDelay: "80ms" }}
              onDragOver={(e) => { e.preventDefault(); if (!locked) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            >
              <div
                className={cx(
                  "relative rounded-[28px] p-px transition-all duration-300",
                  dragging
                    ? "bg-gradient-to-b from-[#8B7CFF] to-[#FF7A45]/60"
                    : "bg-gradient-to-b from-white/[0.16] to-white/[0.03] focus-within:from-[#8B7CFF]/70 focus-within:to-[#FF7A45]/25"
                )}
              >
                <div className="relative overflow-hidden rounded-[27px] bg-[#101218]/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                  {locked && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0A0B10]/80 backdrop-blur-sm">
                      <div className="px-6 text-center">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFB547]/10 ring-1 ring-[#FFB547]/30">
                          <Lock className="h-4 w-4 text-[#FFB547]" />
                        </div>
                        <p className="text-sm font-semibold text-white">You're out of credits</p>
                        <button onClick={onRequestTopUp} className="mt-2 text-xs font-medium text-[#B4A9FF] underline-offset-4 hover:underline">
                          Get more credits →
                        </button>
                      </div>
                    </div>
                  )}

                  {dragging && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#8B7CFF]/10">
                      <p className="lu-serif text-2xl text-white">Drop to attach</p>
                    </div>
                  )}

                  {uploadedFile && (
                    <div className="px-5 pt-4">
                      <div
                        className={cx(
                          "inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-xl px-3 py-2 text-sm ring-1",
                          exceedsPageLimit ? "bg-[#FFB547]/[0.08] ring-[#FFB547]/30" : "bg-[#8B7CFF]/[0.08] ring-[#8B7CFF]/25"
                        )}
                      >
                        <div className={cx("flex h-7 w-7 items-center justify-center rounded-lg", exceedsPageLimit ? "bg-[#FFB547]/15" : "bg-[#8B7CFF]/15")}>
                          <FileText className={cx("h-3.5 w-3.5", exceedsPageLimit ? "text-[#FFB547]" : "text-[#B4A9FF]")} />
                        </div>
                        <span className="max-w-[160px] truncate font-medium text-white sm:max-w-[280px]">{uploadedFile.name}</span>
                        <span className="text-xs text-[#8A8FA3]">{(uploadedFile.size / 1024 / 1024).toFixed(1)} MB</span>
                        {checkingPages && (
                          <span className="flex items-center gap-1 text-xs text-[#8A8FA3]">
                            <Loader2 className="h-3 w-3 animate-spin" /> Checking pages…
                          </span>
                        )}
                        {pageCount !== null && (
                          <span className={cx("text-xs font-semibold", exceedsPageLimit ? "text-[#FFB547]" : "text-[#B4A9FF]")}>
                            {pageCount} page{pageCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        <button onClick={clearFile} className="rounded-md p-0.5 text-[#8A8FA3] transition-colors hover:bg-white/10 hover:text-white" aria-label="Remove file">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {exceedsPageLimit && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#FFB547]">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          This PDF has {pageCount} pages — the limit is {MAX_PAGES}. Please trim it before uploading.
                        </p>
                      )}
                      {pageCountError && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#FFB547]">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {pageCountError}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="px-5 pb-2 pt-4">
                    <textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => { if (!locked) setInputValue(e.target.value); }}
                      onKeyDown={handleKeyDown}
                      placeholder={locked ? "Out of credits — contact us for more" : "Explain DNA replication and cell division…"}
                      rows={1}
                      disabled={locked}
                      className="w-full resize-none bg-transparent text-[17px] leading-relaxed text-white placeholder:text-[#555A6E] focus:outline-none disabled:cursor-not-allowed"
                      style={{ minHeight: "52px", maxHeight: "200px" }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                    <div className="flex min-w-0 items-center gap-1">
                      <input ref={fileRef} type="file" accept=".pdf,.pptx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
                      <button
                        onClick={() => !locked && fileRef.current?.click()}
                        disabled={locked}
                        className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-[#B9BCCB] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                        title="Attach PDF or PPTX"
                      >
                        <Paperclip className="h-4 w-4" />
                        <span className="hidden sm:inline">Attach notes</span>
                      </button>
                      <span className="hidden truncate text-[11px] text-[#555A6E] sm:inline">PDF ≤ {MAX_PAGES} pages · PPTX · 25MB</span>
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className={cx(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                        canSubmit
                          ? "bg-[#8B7CFF] text-[#0A0B10] shadow-[0_10px_30px_-8px_rgba(139,124,255,0.9)] hover:scale-105 hover:bg-[#A093FF]"
                          : "bg-white/[0.05] text-[#555A6E]"
                      )}
                      aria-label="Continue"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lu-rise mt-5 flex flex-wrap justify-center gap-2" style={{ animationDelay: "160ms" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => !locked && setInputValue(s)}
                  className="rounded-full bg-white/[0.03] px-3.5 py-1.5 text-xs text-[#8A8FA3] ring-1 ring-white/[0.07] transition-all hover:bg-white/[0.07] hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="lu-rise mt-14 grid grid-cols-3 gap-3 sm:gap-6" style={{ animationDelay: "240ms" }}>
              {[
                { icon: Wand2, t: "Describe", d: "A topic or your notes" },
                { icon: Film, t: "Watch", d: "Narrated, animated lessons" },
                { icon: Target, t: "Prove it", d: "A graded readiness quiz" },
              ].map(({ icon: I, t, d }, i) => (
                <div key={t} className="text-center">
                  <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.07]">
                    <I className="h-4 w-4 text-[#B4A9FF]" />
                  </div>
                  <p className="text-[13px] font-semibold text-white"><span className="mr-1 text-[#555A6E]">{pad2(i + 1)}</span>{t}</p>
                  <p className="mt-0.5 text-[11px] text-[#6E7389] sm:text-xs">{d}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-xs text-[#555A6E]">A full course is ready in about 5 minutes.</p>
          </>
        )}
      </div>
    </div>
  );
}

function FormatPicker({ topic, tiers, balance, selectedKey, onSelect, onConfirm, onBack, onRequestTopUp }: {
  topic: string; tiers: CourseTier[] | null; balance: number; selectedKey: string | null;
  onSelect: (k: string) => void; onConfirm: () => void; onBack: () => void; onRequestTopUp: () => void;
}) {
  const selected = tiers?.find((t) => t.key === selectedKey) ?? null;
  return (
    <div className="lu-rise">
      <button onClick={onBack} className={cx(BTN_GHOST, "-ml-3 mb-6 h-8 px-3")}>
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className={EYEBROW}>Choose a format</p>
          <h2 className="lu-serif mt-2 text-4xl leading-tight text-white sm:text-5xl">How deep should we go?</h2>
          <p className="mt-2 truncate text-sm text-[#8A8FA3]">For “{cleanName(topic)}”</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#E3E5EE] ring-1 ring-white/[0.08] sm:self-auto">
          <Zap className="h-3.5 w-3.5 text-[#FFB547]" /> {balance} credit{balance !== 1 ? "s" : ""} available
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup">
        {!tiers
          ? [0, 1, 2].map((i) => <Shimmer key={i} className="h-[260px] rounded-2xl" delay={i * 0.15} />)
          : tiers.map((t, i) => {
              const affordable = balance >= t.creditCost;
              const isSel = selectedKey === t.key;
              const recommended = i === 1;
              const perLesson = t.lessonCount > 0 ? Math.round(t.creditCost / t.lessonCount) : t.creditCost;
              return (
                <div
                  key={t.key}
                  role="radio"
                  aria-checked={isSel}
                  aria-disabled={!affordable}
                  tabIndex={affordable ? 0 : -1}
                  onClick={() => affordable && onSelect(t.key)}
                  onKeyDown={(e) => { if (affordable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(t.key); } }}
                  className={cx(
                    "group relative flex flex-col rounded-2xl p-5 text-left outline-none transition-all duration-300",
                    !affordable
                      ? "cursor-not-allowed bg-white/[0.02] opacity-50 ring-1 ring-white/[0.05]"
                      : isSel
                      ? "cursor-pointer bg-[#8B7CFF]/[0.1] ring-2 ring-[#8B7CFF] shadow-[0_20px_60px_-25px_rgba(139,124,255,0.9)] sm:-translate-y-1"
                      : "cursor-pointer bg-[#11131A] ring-1 ring-white/[0.08] hover:-translate-y-0.5 hover:ring-white/[0.2] focus-visible:ring-[#8B7CFF]/60"
                  )}
                >
                  {recommended && (
                    <span className="absolute -top-2.5 left-5 rounded-full bg-gradient-to-r from-[#8B7CFF] to-[#FF7A45] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0A0B10]">
                      Most picked
                    </span>
                  )}
                  <span
                    className={cx(
                      "absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full ring-1 transition-all",
                      isSel ? "bg-[#8B7CFF] ring-[#8B7CFF]" : "ring-white/20"
                    )}
                  >
                    {isSel && <Check className="h-3 w-3 text-[#0A0B10]" strokeWidth={3} />}
                  </span>

                  <p className="pr-6 text-[15px] font-semibold text-white">{t.name}</p>
                  <p className="mt-1 min-h-[36px] text-xs leading-relaxed text-[#8A8FA3]">{t.description}</p>

                  {/* Lesson count as a strip of frames */}
                  <div className="mt-4 flex gap-1" aria-hidden="true">
                    {Array.from({ length: Math.min(t.lessonCount, 12) }).map((_, k) => (
                      <span key={k} className={cx("h-6 flex-1 rounded-[4px] transition-colors", isSel ? "bg-[#8B7CFF]/70" : "bg-white/[0.1] group-hover:bg-white/[0.16]")} style={{ maxWidth: 22 }} />
                    ))}
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-[#B9BCCB]">
                    <p className="flex items-center gap-1.5"><Film className="h-3 w-3 text-[#6E7389]" />{t.lessonCount} lesson{t.lessonCount !== 1 ? "s" : ""}</p>
                    <p className="flex items-center gap-1.5"><ClipboardList className="h-3 w-3 text-[#6E7389]" />{t.mcqCount} questions · {t.timeAllocationMinutes} min</p>
                  </div>

                  <div className="mt-auto flex items-baseline justify-between border-t border-white/[0.07] pt-4" style={{ marginTop: 20 }}>
                    <p className="text-2xl font-bold tracking-tight text-white">
                      {t.creditCost}<span className="ml-1 text-xs font-medium text-[#6E7389]">credits</span>
                    </p>
                    <p className="text-[10px] text-[#6E7389]">~{perLesson}/lesson</p>
                  </div>
                  {!affordable && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRequestTopUp(); }}
                      className="pointer-events-auto mt-3 self-start text-xs font-semibold text-[#B4A9FF] underline-offset-4 hover:underline"
                      style={{ opacity: 1 }}
                    >
                      Need credits? Contact us
                    </button>
                  )}
                </div>
              );
            })}
      </div>

      <div
        className={cx(
          "mt-6 flex flex-col gap-3 rounded-2xl p-4 transition-all duration-300 sm:flex-row sm:items-center",
          selected ? "bg-white/[0.04] ring-1 ring-white/[0.08]" : "pointer-events-none opacity-0"
        )}
      >
        <p className="flex-1 text-sm text-[#B9BCCB]">
          {selected && (
            <>
              <span className="font-semibold text-white">{selected.name}</span> · {selected.lessonCount} lesson{selected.lessonCount !== 1 ? "s" : ""} + {selected.mcqCount}-question quiz · <span className="text-white">{selected.creditCost} credits</span>
            </>
          )}
        </p>
        <button onClick={onConfirm} disabled={!selected} className={cx(BTN_PRIMARY, "h-11 px-5")}>
          <Sparkles className="h-4 w-4" /> Generate course
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation stages
// ─────────────────────────────────────────────────────────────────────────────

function GeneratingStage() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % GENERATION_PHASES.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative flex aspect-video flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#07080C] px-4 text-center ring-1 ring-white/[0.08]">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }}
      />
      <div className="absolute inset-0 lu-grain opacity-50" />

      <span className="relative mb-6 inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E3E5EE] ring-1 ring-white/10">
        <RecDot /> In production
      </span>

      <div className="relative mb-6 flex gap-1.5 rounded-lg bg-white/[0.03] p-2 ring-1 ring-white/[0.06]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-6 rounded-[3px] bg-gradient-to-b from-[#8B7CFF]/60 to-[#FF7A45]/30 sm:h-12 sm:w-8"
            style={{ animation: "lu-frame 2.4s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>

      <div className="relative mb-6 flex h-7 items-center gap-[3px] sm:h-8">
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            className="h-full w-[3px] rounded-full bg-[#B4A9FF]/80"
            style={{ animation: "lu-wave 1.1s ease-in-out infinite", animationDelay: `${(i % 9) * 0.08}s` }}
          />
        ))}
      </div>

      <p key={phase} className="lu-rise lu-serif relative text-2xl text-white sm:text-3xl">{GENERATION_PHASES[phase]}</p>
      <p className="relative mt-1.5 text-xs text-[#6E7389] sm:text-sm">This usually takes about 6 minutes.</p>
    </div>
  );
}

// Only compiles once this scene's own previewCode exists; keyed by scene index.
function SceneCell({ scene }: { scene: SceneProgressItem }) {
  const { Component } = useCompilation(scene.previewCode ?? "");
  const ready = scene.codeReady;
  const hasThumbnail = ready && !!scene.previewCode && !!Component;

  return (
    <div
      className={cx(
        "relative h-14 overflow-hidden rounded-lg ring-1 transition-all duration-700 sm:h-20",
        ready ? "bg-[#3DDC97]/[0.07] ring-[#3DDC97]/40" : "bg-white/[0.03] ring-white/[0.06]"
      )}
      style={{ flexGrow: scene.durationInFrames ?? 1, flexBasis: 0, flexShrink: 0 }}
      title={scene.label}
    >
      {hasThumbnail ? (
        <>
          <Thumbnail
            component={Component!}
            frameToDisplay={Math.min(30, Math.max(1, Math.floor((scene.durationInFrames ?? 60) / 2)))}
            durationInFrames={scene.durationInFrames ?? 1}
            compositionWidth={1920}
            compositionHeight={1080}
            fps={30}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div className="absolute right-1 top-1 rounded-full bg-[#3DDC97] p-0.5 animate-in zoom-in fade-in duration-300">
            <Check className="h-2.5 w-2.5 text-[#06130D]" strokeWidth={3} />
          </div>
        </>
      ) : ready ? (
        <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in fade-in duration-300">
          <Check className="h-4 w-4 text-[#3DDC97] sm:h-5 sm:w-5" strokeWidth={3} />
        </div>
      ) : (
        <div
          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
          style={{ animation: "lu-scan 2.2s ease-in-out infinite" }}
        />
      )}
    </div>
  );
}

// NLE-style timeline: a voice track and a picture track filling in live.
function SceneTimeline({ sceneProgress }: { sceneProgress: SceneProgressItem[] }) {
  const readyCount = sceneProgress.filter((s) => s.codeReady).length;
  const audioCount = sceneProgress.filter((s) => s.audioReady).length;
  const pct = Math.round(computeRealLessonProgress(sceneProgress) ?? 0);

  return (
    <div className="relative flex aspect-video flex-col overflow-hidden rounded-2xl bg-[#07080C] ring-1 ring-white/[0.08]">
      <div className="absolute inset-0 lu-grain opacity-40" />
      <div className="relative flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-5">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E3E5EE]">
          <RecDot /> Building lesson
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-white">{pct}%</span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-5 px-4 sm:px-8">
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-[#8A8FA3]">
            <span className="flex items-center gap-1.5"><Mic className="h-3 w-3" /> Voice</span>
            <span className="tabular-nums">{audioCount}/{sceneProgress.length}</span>
          </div>
          <div className="flex h-5 gap-1 sm:h-6">
            {sceneProgress.map((s) => (
              <div
                key={s.index}
                className={cx("relative overflow-hidden rounded-[5px] transition-colors duration-500", s.audioReady ? "bg-[#8B7CFF]/25" : "bg-white/[0.04]")}
                style={{ flexGrow: s.durationInFrames ?? 1, flexBasis: 0, flexShrink: 0 }}
              >
                {s.audioReady && (
                  <div className="absolute inset-0 flex items-center justify-center gap-[2px] px-1">
                    {Array.from({ length: 6 }).map((_, k) => (
                      <span key={k} className="w-[2px] rounded-full bg-[#B4A9FF]" style={{ height: `${30 + ((k * 37 + s.index * 13) % 60)}%` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-[#8A8FA3]">
            <span className="flex items-center gap-1.5"><Film className="h-3 w-3" /> Picture</span>
            <span className="tabular-nums">{readyCount}/{sceneProgress.length}</span>
          </div>
          <div className="flex gap-1 sm:gap-1.5">
            {sceneProgress.map((s) => <SceneCell key={s.index} scene={s} />)}
          </div>
        </div>
      </div>

      <div className="relative px-4 pb-4 sm:px-6 sm:pb-5">
        <p className="lu-serif text-lg text-white sm:text-xl">{readyCount} of {sceneProgress.length} scenes animated</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesson stage (player + up-next + key points)
// ─────────────────────────────────────────────────────────────────────────────

function LessonStage({
  lesson, onComplete, onRetry, retrying, retryingLabel, courseId, lessonNumber, totalLessons,
  nextLessonTitle, nextLessonReady, onPlayNext, controls,
}: {
  lesson: Lesson; onComplete: () => void; onRetry?: (info?: LessonCrashInfo) => void; retrying?: boolean; retryingLabel?: string;
  courseId: string | null; lessonNumber: number; totalLessons: number;
  nextLessonTitle?: string | null; nextLessonReady?: boolean; onPlayNext?: () => void; controls?: ReactNode;
}) {
  const [showUpNext, setShowUpNext] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number | null>(null);
  // Armed right before a Play next / auto-advance — read once by DynamicPlayer
  // to resume playback on the next lesson without leaving fullscreen.
  const autoContinueRef = useRef(false);

  useEffect(() => { setShowUpNext(false); setDismissed(false); setAutoAdvanceSeconds(null); }, [lessonNumber]);

  const lastFrameRef = useRef(0);
  const lastSentAtRef = useRef(0);

  // Best-effort position flush on lesson switch/unmount.
  useEffect(() => {
    return () => {
      if (courseId) logPosition(courseId, lessonNumber, lastFrameRef.current, { keepalive: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonNumber]);

  // Same flush on tab hide/close (pagehide survives bfcache + mobile Safari).
  useEffect(() => {
    if (!courseId) return;
    const flush = () => { logPosition(courseId, lessonNumber, lastFrameRef.current, { keepalive: true }).catch(() => {}); };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [courseId, lessonNumber]);

  const handleFrameUpdate = (frame: number) => {
    lastFrameRef.current = frame;
    if (courseId && Date.now() - lastSentAtRef.current >= POSITION_REPORT_INTERVAL_MS) {
      lastSentAtRef.current = Date.now();
      logPosition(courseId, lessonNumber, frame).catch(() => {});
    }
    if (!lesson.totalFrames || !nextLessonTitle || !nextLessonReady || dismissed) return;
    const secondsRemaining = (lesson.totalFrames - frame) / FPS;
    setShowUpNext(secondsRemaining > 0 && secondsRemaining <= UP_NEXT_THRESHOLD_SEC);
  };

  const playNext = () => {
    setDismissed(true);
    setShowUpNext(false);
    setAutoAdvanceSeconds(null);
    autoContinueRef.current = true;
    onPlayNext?.();
  };

  const cancelAutoAdvance = () => {
    setDismissed(true);
    setShowUpNext(false);
    setAutoAdvanceSeconds(null);
  };

  // Countdown kept in a local variable and playNext() called from the interval
  // callback — never from inside a state updater (StrictMode double-invokes
  // those, which previously skipped a whole lesson).
  useEffect(() => {
    if (!showUpNext) return;
    let remaining = AUTO_ADVANCE_SECONDS;
    setAutoAdvanceSeconds(remaining);
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        setAutoAdvanceSeconds(null);
        playNext();
      } else {
        setAutoAdvanceSeconds(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUpNext]);

  const handleEnded = () => {
    onComplete();
    if (courseId) markLessonWatched(courseId, lessonNumber).catch((err) => console.error("Failed to persist watched state:", err));
  };

  const points = lesson.keyPoints.filter((p) => p !== "");
  const pointsLoading = lesson.keyPoints.length > 0 && lesson.keyPoints.every(isPlaceholderPoint);
  const isBuilding = !lesson.code;
  const durationLabel = lessonDuration(lesson);

  return (
    <div className="space-y-6">
      <div key={lessonNumber} className="lu-rise flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className={EYEBROW}>
            Lesson {pad2(lessonNumber)} <span className="text-[#3E4253]">/ {pad2(totalLessons)}</span>
            {lesson.completed && <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-[#3DDC97]"><CheckCircle2 className="h-3 w-3" /> Watched</span>}
          </p>
          <h2 className="lu-serif mt-2 text-3xl leading-[1.08] text-white sm:text-[44px]">{lesson.title}</h2>
        </div>
        {!isBuilding && durationLabel && (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs text-[#6E7389] sm:inline-flex">
            <Clock className="h-3.5 w-3.5" /> {durationLabel}
          </span>
        )}
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-0 rounded-[32px] opacity-40 blur-3xl" style={{ background: `radial-gradient(60% 60% at 50% 40%, ${C.iris}33, transparent)` }} />
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/[0.08] shadow-[0_40px_100px_-40px_rgba(0,0,0,1)]">
          {isBuilding ? (
            lesson.sceneProgress && lesson.sceneProgress.length > 0
              ? <SceneTimeline sceneProgress={lesson.sceneProgress} />
              : <GeneratingStage />
          ) : (
            // No lesson-scoped `key` on these two — remounting would drop the
            // fullscreen container on every lesson switch.
            <PlayerErrorBoundary resetKey={lesson.code ?? "no-code"} onRetry={onRetry} retrying={retrying} retryingLabel={retryingLabel}>
              <DynamicPlayer
                code={lesson.code!}
                durationInFrames={lesson.totalFrames ?? 3600}
                onEnded={handleEnded}
                onRetry={onRetry}
                retrying={retrying}
                retryingLabel={retryingLabel}
                onFrameUpdate={handleFrameUpdate}
                scenes={lesson.scenes}
                continuePlaybackRef={autoContinueRef}
                // Rendered INSIDE the fullscreened container so it shows in fullscreen too.
                overlay={showUpNext && (
                  <div className="lu-rise absolute bottom-5 right-5 z-10 w-[min(320px,calc(100%-2.5rem))] overflow-hidden rounded-2xl bg-[#0A0B10]/90 text-[#ECEDF2] shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
                    <div className="p-4">
                      <p className="text-[11px] font-medium text-[#8A8FA3]">
                        Up next{autoAdvanceSeconds != null && <> · plays in <span className="font-semibold tabular-nums text-white">{autoAdvanceSeconds}s</span></>}
                      </p>
                      <p className="lu-serif mt-0.5 truncate text-lg text-white">{nextLessonTitle}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <button onClick={cancelAutoAdvance} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-medium text-[#B9BCCB] ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white">
                          <X className="h-3.5 w-3.5" /> Cancel
                        </button>
                        <button onClick={playNext} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#8B7CFF] text-xs font-semibold text-[#0A0B10] transition-colors hover:bg-[#A093FF]">
                          <Play className="h-3 w-3 fill-current" /> Play next
                        </button>
                      </div>
                    </div>
                    <div className="h-0.5 bg-white/10">
                      <div
                        className="h-full bg-[#8B7CFF] transition-[width] duration-1000 ease-linear"
                        style={{ width: `${((autoAdvanceSeconds ?? 0) / AUTO_ADVANCE_SECONDS) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              />
            </PlayerErrorBoundary>
          )}
        </div>
      </div>

      {controls}

      <section className="grid gap-6 pt-2 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className={EYEBROW}>About this lesson</p>
          {lesson.description && !isPlaceholderPoint(lesson.description) && lesson.description !== "Generating…" && lesson.description !== "Generating your first lesson…" ? (
            <p className="mt-3 text-[15px] leading-relaxed text-[#B9BCCB]">{lesson.description}</p>
          ) : (
            <div className="mt-3 space-y-2">
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-3 w-4/5" delay={0.1} />
              <Shimmer className="h-3 w-2/3" delay={0.2} />
            </div>
          )}
        </div>
        <div>
          <p className={EYEBROW}>Key points</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {(pointsLoading ? lesson.keyPoints : points).map((pt, i) => (
              <li key={i} className={cx(SURFACE, "flex gap-3 p-3.5")}>
                <span className="font-mono text-[11px] font-semibold text-[#8B7CFF]">{pad2(i + 1)}</span>
                {isPlaceholderPoint(pt)
                  ? <span className="flex-1 space-y-1.5 pt-0.5"><Shimmer className="h-2.5 w-full" delay={i * 0.1} /><Shimmer className="h-2.5 w-3/5" delay={i * 0.1} /></span>
                  : <span className="text-[13px] leading-relaxed text-[#E3E5EE]">{pt}</span>}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function CourseContentSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-3">
        <Shimmer className="h-3 w-28" />
        <Shimmer className="h-10 w-2/3" delay={0.1} />
      </div>
      <Shimmer className="w-full rounded-2xl" style={{ aspectRatio: "16/9" }} delay={0.15} />
      <div className="flex items-center justify-between gap-2">
        <Shimmer className="h-10 w-28 rounded-xl" delay={0.2} />
        <Shimmer className="h-10 w-36 rounded-xl" delay={0.3} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quiz
// ─────────────────────────────────────────────────────────────────────────────

/** Shown when a finished course has no quiz — recoverable, not a dead end. */
function QuizMissing({ onRegenerate, stalled = false }: { onRegenerate?: () => Promise<void>; stalled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = async () => {
    if (!onRegenerate) return;
    setBusy(true);
    setError(null);
    try {
      await onRegenerate();
    } catch (err) {
      setError((err as Error)?.message || "Couldn't rebuild the quiz.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx(SURFACE, "flex flex-col items-center px-6 py-16 text-center")}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFB547]/10 ring-1 ring-[#FFB547]/25">
        <ClipboardList className="h-5 w-5 text-[#FFB547]" />
      </span>
      <p className="lu-serif text-3xl leading-tight text-white">
        {stalled ? "Your quiz is taking too long" : "This quiz didn't get written"}
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#8A8FA3]">
        {stalled
          ? "Your lessons are done, but the assessment step has been running far longer than it should. Rebuilding it usually takes under a minute, and costs you nothing."
          : "Your lessons are fine — only the assessment failed to generate, which happens occasionally. Rebuilding it costs you nothing."}
      </p>
      {onRegenerate && (
        <button onClick={retry} disabled={busy} className={cx(BTN_PRIMARY, "mt-6")}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing your quiz…</> : <><RotateCcw className="h-4 w-4" /> Build the quiz</>}
        </button>
      )}
      {busy && <p className="mt-2 text-[11px] text-[#555A6E]">This takes up to a minute.</p>}
      {error && <p className="mt-3 text-[12px] text-[#FF8A95]">{error}</p>}
    </div>
  );
}

function QuizStage({ questions, onSubmit, timeAllocationMinutes = 30, courseStatus, lessonsBuilt = false, onRegenerate }: {
  questions: MCQQuestion[];
  onSubmit: (answers: QuizAnswer[]) => void;
  timeAllocationMinutes?: number;
  /** The COURSE's status — not the lessons'. The quiz is written after the
   *  last lesson, so these differ for the whole duration of quiz generation. */
  courseStatus?: "generating" | "ready" | "failed";
  /** True when every lesson has finished, which is when the quiz is being written. */
  lessonsBuilt?: boolean;
  onRegenerate?: () => Promise<void>;
}) {
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeAllocationMinutes * 60);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [submitted, timeLeft]);

  const select = (qId: number, opt: number) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionId === qId);
      if (existing >= 0) { const n = [...prev]; n[existing] = { questionId: qId, selected: opt }; return n; }
      return [...prev, { questionId: qId, selected: opt }];
    });
  };

  // Quiz generation is the last step and normally lands in well under a
  // minute. Past that the wait stops being normal — most likely a stalled
  // provider call — so the rebuild is offered rather than spinning forever.
  const [slowQuiz, setSlowQuiz] = useState(false);
  useEffect(() => {
    const waitingOnQuiz = courseStatus === "generating" && lessonsBuilt && !questions?.length;
    if (!waitingOnQuiz) { setSlowQuiz(false); return; }
    const t = setTimeout(() => setSlowQuiz(true), 90_000);
    return () => clearTimeout(t);
  }, [courseStatus, lessonsBuilt, questions?.length]);

  // Keyboard: A–H / 1–8 answer, ←/→ move.
  useEffect(() => {
    if (!questions?.length || submitted) return;
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
      if (idx >= 0 && idx < q.options.length) { e.preventDefault(); select(q.id, idx); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions, currentQ, submitted]);

  if (!questions || questions.length === 0) {
    // A quiz failure doesn't fail the course (processCourse swallows it so the
    // lessons still ship), so "being prepared" was shown forever on a course
    // that had finished with nothing preparing it. Once the course has
    // settled, say so and offer the retry.
    if (courseStatus === "generating" && !slowQuiz) {
      return (
        <div className={cx(SURFACE, "flex flex-col items-center px-6 py-20 text-center")}>
          <Loader2 className="mb-3 h-7 w-7 animate-spin text-[#8B7CFF]" />
          <p className="lu-serif text-2xl text-white">
            {lessonsBuilt ? "Writing your quiz…" : "Your assessment is being prepared…"}
          </p>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[#8A8FA3]">
            {lessonsBuilt
              ? "Every lesson is done. The questions come last, written from what they actually say — this is the final step."
              : "The quiz is written last, from what the lessons actually say."}
          </p>
        </div>
      );
    }
    return <QuizMissing onRegenerate={onRegenerate} stalled={courseStatus === "generating"} />;
  }

  const answered = (id: number) => answers.find((a) => a.questionId === id);
  const fmt = (s: number) => { const v = Math.max(s, 0); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
  const q = questions[currentQ];
  const totalSeconds = timeAllocationMinutes * 60;
  const lowTime = timeLeft < 300;
  const remaining = questions.length - answers.length;
  const handleSubmit = () => { setSubmitted(true); onSubmit(answers); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className={EYEBROW}>Final assessment</p>
          <h2 className="lu-serif mt-2 text-3xl text-white sm:text-[44px]">Show what you know</h2>
          <p className="mt-1 text-sm text-[#8A8FA3]">{answers.length} of {questions.length} answered</p>
        </div>
        <Ring value={(timeLeft / totalSeconds) * 100} size={68} stroke={4} color={lowTime ? C.rose : C.iris}>
          <span className={cx("font-mono text-[13px] font-semibold tabular-nums", lowTime ? "text-[#FF5C6C]" : "text-white")}>{fmt(timeLeft)}</span>
        </Ring>
      </div>

      <div className="flex gap-1" role="tablist" aria-label="Questions">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            onClick={() => setCurrentQ(i)}
            title={`Question ${i + 1}`}
            className={cx(
              "h-1.5 flex-1 rounded-full transition-all hover:h-2.5",
              i === currentQ ? "bg-[#8B7CFF]" : answered(qq.id) ? "bg-[#3DDC97]/70" : "bg-white/[0.1]"
            )}
          />
        ))}
      </div>

      <div key={q.id} className={cx(SURFACE, "lu-rise p-5 sm:p-8")}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-[#8B7CFF]/10 px-2.5 py-1 text-[11px] font-medium text-[#C3BAFF] ring-1 ring-[#8B7CFF]/25">{q.topic}</span>
          <span className="font-mono text-xs text-[#6E7389]">Q{pad2(currentQ + 1)} / {pad2(questions.length)}</span>
        </div>
        <p className="lu-serif text-2xl leading-snug text-white sm:text-[30px]">{q.question}</p>
        <div className="mt-6 space-y-2.5">
          {q.options.map((opt, i) => {
            const sel = answered(q.id)?.selected === i;
            return (
              <button
                key={i}
                onClick={() => select(q.id, i)}
                className={cx(
                  "group flex w-full items-center gap-3.5 rounded-xl p-3.5 text-left text-[14px] ring-1 transition-all sm:p-4",
                  sel
                    ? "bg-[#8B7CFF]/[0.12] text-white ring-[#8B7CFF]"
                    : "bg-white/[0.02] text-[#D6D8E2] ring-white/[0.08] hover:bg-white/[0.05] hover:ring-white/[0.18]"
                )}
              >
                <span
                  className={cx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold transition-colors",
                    sel ? "bg-[#8B7CFF] text-[#0A0B10]" : "bg-white/[0.06] text-[#8A8FA3] group-hover:text-white"
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="leading-relaxed">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setCurrentQ((qi) => Math.max(0, qi - 1))} disabled={currentQ === 0} className={BTN_SOFT}>
          <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
        </button>
        <span className="hidden items-center gap-1.5 text-[11px] text-[#555A6E] md:inline-flex">
          <Keyboard className="h-3.5 w-3.5" /> A–D to answer · ← → to move
        </span>
        {currentQ < questions.length - 1 ? (
          <button onClick={() => setCurrentQ((qi) => Math.min(questions.length - 1, qi + 1))} className={BTN_PRIMARY}>
            Next<ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={answers.length < questions.length} className={BTN_PRIMARY}>
            <Trophy className="h-4 w-4" />Submit assessment
          </button>
        )}
      </div>
      {remaining > 0 && currentQ === questions.length - 1 && (
        <p className="text-center text-xs text-[#FFB547]">{remaining} question{remaining !== 1 ? "s" : ""} still unanswered</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

function readinessTone(pct: number) {
  if (pct >= 85) return { color: C.mint, label: "Exam Ready" };
  if (pct >= 70) return { color: C.iris, label: "Almost Ready" };
  if (pct >= 55) return { color: C.amber, label: "Needs Review" };
  return { color: C.rose, label: "Needs Practice" };
}

// ── Shared scales ───────────────────────────────────────────────────────────
// 70% is the line everything in the results view is measured against: it's
// the same threshold the strengths/needs-review split has always used, now
// drawn explicitly on every chart so a bar's length means something.
const PASS_MARK = 70;

const MASTERY_BANDS = [
  { min: 85, label: "Mastered", color: C.mint },
  { min: 70, label: "Solid", color: C.iris },
  { min: 50, label: "Shaky", color: C.amber },
  { min: 0, label: "Weak", color: C.rose },
];

function bandFor(pct: number) {
  return MASTERY_BANDS.find((b) => pct >= b.min) ?? MASTERY_BANDS[MASTERY_BANDS.length - 1];
}

/** Level to pitch a follow-up course at, inferred from how the quiz went. */
function levelFromPct(pct: number): Level {
  if (pct >= 80) return "advanced";
  if (pct >= 55) return "intermediate";
  return "beginner";
}

function KpiTile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-inset ring-white/[0.06]">
      <p className={EYEBROW}>{label}</p>
      <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums" style={{ color: color ?? "#FFFFFF" }}>{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-[#6E7389]">{sub}</p>}
    </div>
  );
}

// ── Score-over-attempts chart ───────────────────────────────────────────────
// Every retake is stored as its own QuizAttempt (see the model's comment), so
// a real trend line is available the moment someone sits the quiz twice — it
// just was never drawn. Hidden entirely for a single attempt, where a
// one-point "line" would say nothing.
function AttemptTrend({ attempts }: { attempts: { pct: number; submittedAt: string }[] }) {
  const W = 340, H = 150, L = 30, R = 12, T = 12, B = 24;
  const plotW = W - L - R, plotH = H - T - B;
  const x = (i: number) => L + (attempts.length === 1 ? plotW / 2 : (i / (attempts.length - 1)) * plotW);
  const y = (pct: number) => T + plotH - (Math.min(Math.max(pct, 0), 100) / 100) * plotH;

  const line = attempts.map((a, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(a.pct).toFixed(1)}`).join(" ");
  const area = `${line} L${x(attempts.length - 1).toFixed(1)},${(T + plotH).toFixed(1)} L${x(0).toFixed(1)},${(T + plotH).toFixed(1)} Z`;
  const first = attempts[0].pct;
  const last = attempts[attempts.length - 1].pct;
  const delta = last - first;

  return (
    <div className={cx(SURFACE, "p-5 sm:p-6")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={EYEBROW}>Score across attempts</p>
        <p className="text-[11px] tabular-nums text-[#6E7389]">
          {attempts.length} attempts ·{" "}
          <span style={{ color: delta >= 0 ? C.mint : C.rose }}>
            {delta > 0 ? "+" : ""}{delta}% since the first
          </span>
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={`Quiz score across ${attempts.length} attempts`}>
        <defs>
          <linearGradient id="lu-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.iris} stopOpacity="0.35" />
            <stop offset="100%" stopColor={C.iris} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={L} y1={y(g)} x2={W - R} y2={y(g)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize="8" fill="#4A4F63">{g}</text>
          </g>
        ))}

        {/* Pass mark — the same 70% used everywhere else on this page. */}
        <line x1={L} y1={y(PASS_MARK)} x2={W - R} y2={y(PASS_MARK)} stroke={C.mint} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
        <text x={W - R} y={y(PASS_MARK) - 4} textAnchor="end" fontSize="8" fill={C.mint} fillOpacity="0.7">pass {PASS_MARK}%</text>

        <path d={area} fill="url(#lu-trend-fill)" />
        <path d={line} fill="none" stroke={C.iris} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {attempts.map((a, i) => {
          const isLast = i === attempts.length - 1;
          return (
            <g key={i}>
              <circle cx={x(i)} cy={y(a.pct)} r={isLast ? 4.5 : 3} fill={isLast ? C.iris : "#0A0B10"} stroke={C.iris} strokeWidth="1.6" />
              {(isLast || i === 0 || attempts.length <= 6) && (
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="#6E7389">#{i + 1}</text>
              )}
              {isLast && (
                <text x={x(i)} y={y(a.pct) - 9} textAnchor="end" fontSize="9" fontWeight="600" fill="#ECEDF2">{a.pct}%</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Mastery radar ───────────────────────────────────────────────────────────
// Axes are numbered rather than labelled: topics are full lesson titles (the
// quiz generator copies them character-for-character), which never fit around
// a radar. The numbers key into the topic list below, which uses the same
// index.
function MasteryRadar({ topics }: { topics: { topic: string; pct: number }[] }) {
  const size = 230, c = size / 2, rMax = 78;
  const n = topics.length;
  const pointAt = (i: number, r: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const poly = (r: number) => Array.from({ length: n }, (_, i) => pointAt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");
  const dataPoly = topics.map((t, i) => pointAt(i, (Math.min(Math.max(t.pct, 0), 100) / 100) * rMax).map((v) => v.toFixed(1)).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[230px]" role="img" aria-label="Accuracy by topic">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={poly(rMax * f)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      <polygon points={poly(rMax * (PASS_MARK / 100))} fill="none" stroke={C.mint} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" />
      {topics.map((_, i) => {
        const [px, py] = pointAt(i, rMax);
        return <line key={i} x1={c} y1={c} x2={px} y2={py} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      <polygon points={dataPoly} fill={C.iris} fillOpacity="0.2" stroke={C.iris} strokeWidth="2" strokeLinejoin="round" />
      {topics.map((t, i) => {
        const [px, py] = pointAt(i, (Math.min(Math.max(t.pct, 0), 100) / 100) * rMax);
        return <circle key={i} cx={px} cy={py} r="3" fill={bandFor(t.pct).color} />;
      })}
      {topics.map((_, i) => {
        const [px, py] = pointAt(i, rMax + 13);
        return (
          <text key={i} x={px} y={py + 3} textAnchor="middle" fontSize="9" fontWeight="600" fill="#8A8FA3">
            {i + 1}
          </text>
        );
      })}
      <title>{topics.map((t, i) => `${i + 1}. ${t.topic}: ${t.pct}%`).join("\n")}</title>
    </svg>
  );
}

/** Band distribution as a donut — how many topics sit in each mastery band. */
function MasteryDonut({ topics }: { topics: { pct: number }[] }) {
  const size = 132, r = 52, stroke = 13;
  const circ = 2 * Math.PI * r;
  const counts = MASTERY_BANDS.map((b) => ({
    ...b,
    count: topics.filter((t) => bandFor(t.pct).label === b.label).length,
  })).filter((b) => b.count > 0);
  const total = topics.length || 1;

  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          {counts.map((b) => {
            const len = (b.count / total) * circ;
            const el = (
              <circle
                key={b.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={b.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold leading-none text-white tabular-nums">{topics.length}</span>
          <span className="mt-0.5 text-[10px] text-[#6E7389]">topics</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {MASTERY_BANDS.map((b) => {
          const count = topics.filter((t) => bandFor(t.pct).label === b.label).length;
          return (
            <li key={b.label} className="flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color, opacity: count ? 1 : 0.25 }} />
              <span className={cx("min-w-0 flex-1 truncate", count ? "text-[#D6D8E2]" : "text-[#4A4F63]")}>{b.label}</span>
              <span className={cx("shrink-0 tabular-nums", count ? "text-white" : "text-[#4A4F63]")}>{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Per-question map ────────────────────────────────────────────────────────
type QuestionOutcome = { id: number; n: number; topic: string; status: "correct" | "wrong" | "skipped" };

function QuestionMap({ outcomes }: { outcomes: QuestionOutcome[] }) {
  const style = {
    correct: { bg: `${C.mint}1F`, ring: `${C.mint}59`, fg: C.mint },
    wrong: { bg: `${C.rose}1F`, ring: `${C.rose}59`, fg: "#FF8A95" },
    skipped: { bg: "rgba(255,255,255,0.03)", ring: "rgba(255,255,255,0.1)", fg: "#6E7389" },
  };
  const counts = {
    correct: outcomes.filter((o) => o.status === "correct").length,
    wrong: outcomes.filter((o) => o.status === "wrong").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
  };

  return (
    <div className={cx(SURFACE, "p-5 sm:p-7")}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className={EYEBROW}>Question by question</p>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-[#8A8FA3]">
            <span className="h-2 w-2 rounded-full" style={{ background: C.mint }} /> {counts.correct} right
          </span>
          <span className="flex items-center gap-1.5 text-[#8A8FA3]">
            <span className="h-2 w-2 rounded-full" style={{ background: C.rose }} /> {counts.wrong} wrong
          </span>
          {counts.skipped > 0 && (
            <span className="flex items-center gap-1.5 text-[#8A8FA3]">
              <span className="h-2 w-2 rounded-full bg-white/20" /> {counts.skipped} skipped
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {outcomes.map((o) => {
          const s = style[o.status];
          return (
            <span
              key={o.id}
              title={`Q${o.n} · ${o.topic} · ${o.status}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-[11px] font-semibold ring-1 ring-inset"
              style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
            >
              {o.n}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Growth: did the loop actually work? ─────────────────────────────────────
// Shown on a follow-up's own results page. The loop's whole promise is "this
// course will fix the thing you got wrong", so once its quiz is graded the
// claim gets checked against the parent's own result rather than asserted.

type GrowthPoint = { label: string; pct: number; kind?: "repair" | "extend" | null };

/** Score across the chain of courses, root → current. */
function GrowthPath({ points }: { points: GrowthPoint[] }) {
  const W = 340, H = 140, L = 30, R = 14, T = 16, B = 26;
  const plotW = W - L - R, plotH = H - T - B;
  const x = (i: number) => L + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (pct: number) => T + plotH - (Math.min(Math.max(pct, 0), 100) / 100) * plotH;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(T + plotH).toFixed(1)} L${x(0).toFixed(1)},${(T + plotH).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Quiz score across your learning path">
      <defs>
        <linearGradient id="lu-growth-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.mint} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.mint} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={L} y1={y(g)} x2={W - R} y2={y(g)} stroke="rgba(255,255,255,0.06)" />
          <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize="8" fill="#4A4F63">{g}</text>
        </g>
      ))}
      <line x1={L} y1={y(PASS_MARK)} x2={W - R} y2={y(PASS_MARK)} stroke={C.mint} strokeOpacity="0.4" strokeDasharray="3 3" />

      <path d={area} fill="url(#lu-growth-fill)" />
      <path d={line} fill="none" stroke={C.mint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.pct)} r={isLast ? 4.5 : 3.5} fill={isLast ? C.mint : "#0A0B10"} stroke={C.mint} strokeWidth="1.6" />
            <text x={x(i)} y={y(p.pct) - 9} textAnchor="middle" fontSize="9" fontWeight="600" fill="#ECEDF2">{p.pct}%</text>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="#6E7389">
              {i === 0 ? "start" : isLast ? "now" : `#${i + 1}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function GrowthComparison({
  lineage, currentPct,
}: {
  lineage: HistoryEntry[];
  currentPct: number;
}) {
  // lineage is root → current; the course right before this one is its parent.
  const parent = lineage.length >= 2 ? lineage[lineage.length - 2] : null;
  const [parentAttempt, setParentAttempt] = useState<QuizResult | null>(null);

  useEffect(() => {
    if (!parent) return;
    let alive = true;
    getLatestAttempt(parent.id)
      .then((a) => { if (alive) setParentAttempt(a); })
      .catch(() => { /* no graded parent attempt — the overall delta is simply unavailable */ });
    return () => { alive = false; };
  }, [parent?.id]);

  if (!parent) return null;

  const parentPct = parentAttempt?.pct ?? parent.quizScore;

  // flatMap rather than map+filter: dropping the unscored courses this way
  // keeps the element type exact without a type predicate.
  const scored: GrowthPoint[] = lineage.flatMap((e, i) => {
    const isCurrent = i === lineage.length - 1;
    const pct = isCurrent ? currentPct : e.id === parent.id ? parentPct : e.quizScore;
    if (pct === null || pct === undefined) return [];
    return [{ label: cleanName(e.fileName), pct, kind: e.followUpKind }];
  });

  // The chart is the whole panel now, and a chart needs two points — one
  // graded course is nothing to compare, so the panel stays away entirely.
  if (scored.length < 2) return null;

  const overallDelta = parentPct !== null && parentPct !== undefined ? currentPct - parentPct : null;

  return (
    <div className={cx(SURFACE, "relative overflow-hidden p-5 sm:p-7")}>
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-60 w-60 rounded-full opacity-20 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${C.mint}, transparent)` }}
        aria-hidden="true"
      />

      {/* Chart first, the courses it plots underneath it — no prose. The
          numbers carry the comparison on their own. */}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <p className={EYEBROW}>Your progress</p>
        {overallDelta !== null && (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
            style={{
              color: overallDelta >= 0 ? C.mint : C.rose,
              background: `${overallDelta >= 0 ? C.mint : C.rose}14`,
              boxShadow: `inset 0 0 0 1px ${overallDelta >= 0 ? C.mint : C.rose}40`,
            }}
          >
            {overallDelta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {overallDelta > 0 ? "+" : ""}{overallDelta}% overall
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <div className="mx-auto max-w-xl">
          <p className={cx(EYEBROW, "mb-2")}>Learning path · {scored.length} courses</p>
          <GrowthPath points={scored} />
          <ol className="mt-3 space-y-1.5">
            {scored.map((p, i) => (
              <li key={`${p.label}-${i}`} className="flex items-center gap-2 text-[12px]">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white/[0.06] font-mono text-[9px] text-[#8A8FA3]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[#D6D8E2]">{p.label}</span>
                <span className="shrink-0 font-mono tabular-nums" style={{ color: bandFor(p.pct).color }}>{p.pct}%</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ── The learning loop ───────────────────────────────────────────────────────
type FollowUp = { id: string; topic: string; reason: string; kind: "repair" | "extend"; level: Level };

/**
 * Turns a finished quiz into the start of the next course. Two kinds of
 * follow-up, both priced from the same live PricingConfig tiers the composer
 * uses (never a hardcoded number), and both spending through the normal
 * generation path so checkCredits stays the single place credits leave an
 * account:
 *   · "repair"  — a weak topic, re-taught from the ground up (level forced to
 *                 beginner: they already saw the intermediate pass and it
 *                 didn't land).
 *   · "extend"  — an AI-suggested next topic, pitched at the level their score
 *                 implies, so no second assessment chat is needed.
 */
function ContinueLearning({
  weakTopics, pct, courseId, tiers, balance, onGenerate, onRequestTopUp, starting, startError,
}: {
  weakTopics: { topic: string; pct: number }[];
  pct: number;
  courseId?: string | null;
  tiers: CourseTier[] | null;
  balance: number;
  onGenerate: (topic: string, tierKey: string, level: Level, kind: "repair" | "extend") => void;
  onRequestTopUp: () => void;
  starting: boolean; startError: string | null;
}) {
  const [suggestions, setSuggestions] = useState<NextCourseSuggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [tierKey, setTierKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Default to the cheapest tier — a follow-up should read as a small,
  // obvious next step, not the most expensive thing on the page.
  useEffect(() => {
    if (!tierKey && tiers && tiers.length > 0) {
      setTierKey([...tiers].sort((a, b) => a.creditCost - b.creditCost)[0].key);
    }
  }, [tiers, tierKey]);

  const tier = tiers?.find((t) => t.key === tierKey) ?? null;
  const cost = tier?.creditCost ?? 0;
  const affordable = !!tier && balance >= cost;

  const items: FollowUp[] = [
    ...weakTopics.slice(0, 2).map((w) => ({
      id: `repair:${w.topic}`,
      topic: w.topic,
      reason: `You scored ${w.pct}% here. A fresh course re-teaches it from the basics, from a different angle.`,
      kind: "repair" as const,
      level: "beginner" as Level,
    })),
    ...(suggestions ?? []).slice(0, 3).map((s) => ({
      id: `extend:${s.topic}`,
      topic: s.topic,
      reason: s.reason,
      kind: "extend" as const,
      level: levelFromPct(pct),
    })),
  ];

  const loadSuggestions = () => {
    if (!courseId || loadingSuggestions || suggestions) return;
    setLoadingSuggestions(true);
    getNextSuggestions(courseId)
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  };

  // Fetched on arrival rather than behind a button when there's no weak topic
  // to offer instead — otherwise someone who aced the quiz lands on an empty
  // "what next" section, which is the opposite of an obvious next step.
  useEffect(() => {
    if (weakTopics.length === 0) loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, weakTopics.length]);

  // The one action the page is steering toward: shore up the weakest topic
  // if there is one, otherwise the first suggestion.
  const recommendedId = items[0]?.id ?? null;

  const headline =
    weakTopics.length > 0
      ? `${weakTopics.length} topic${weakTopics.length === 1 ? "" : "s"} let you down — fix ${weakTopics.length === 1 ? "it" : "one"} next`
      : "You're ready for the next level";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#11131A] p-5 ring-2 ring-[#8B7CFF]/40 shadow-[0_30px_80px_-40px_rgba(139,124,255,0.65)] sm:p-7">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full opacity-20 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${C.ember}, transparent)` }}
        aria-hidden="true"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#B4A9FF]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#8B7CFF]" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-[#8B7CFF]" />
            </span>
            Your next step
          </p>
          <h3 className="lu-serif mt-2 text-3xl leading-[1.1] text-white sm:text-[40px]">{headline}</h3>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#B9BCCB]">
            One click starts a new course, built from these results and pitched at your level —
            no second assessment. It builds right below this page while you keep reading.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#E3E5EE] ring-1 ring-white/[0.08]">
          <Zap className="h-3.5 w-3.5 text-[#FFB547]" /> {balance} credit{balance !== 1 ? "s" : ""} left
        </span>
      </div>

      {/* Depth / price selector — the cost of every button below. */}
      <div className="relative mt-5">
        <p className={cx(EYEBROW, "mb-2")}>Depth of the next course</p>
        {!tiers ? (
          <div className="flex gap-2">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-16 flex-1 rounded-xl" delay={i * 0.12} />)}</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Depth of the next course">
            {tiers.map((t) => {
              const sel = t.key === tierKey;
              const canAfford = balance >= t.creditCost;
              return (
                <button
                  key={t.key}
                  role="radio"
                  aria-checked={sel}
                  onClick={() => { setTierKey(t.key); setConfirming(null); }}
                  className={cx(
                    "rounded-xl px-3.5 py-2.5 text-left transition-all duration-200",
                    sel
                      ? "bg-[#8B7CFF]/[0.12] ring-2 ring-[#8B7CFF]"
                      : "bg-white/[0.03] ring-1 ring-white/[0.07] hover:bg-white/[0.06] hover:ring-white/[0.14]"
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-white">{t.name}</span>
                    <span className={cx("shrink-0 text-[11px] font-semibold tabular-nums", canAfford ? "text-[#FFB547]" : "text-[#6E7389]")}>
                      {t.creditCost} cr
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#8A8FA3]">
                    {t.lessonCount} lesson{t.lessonCount !== 1 ? "s" : ""} · {t.mcqCount} questions
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Follow-up options */}
      <div className="relative mt-6 space-y-2.5">
        {items.map((item) => {
          const isConfirming = confirming === item.id;
          const isRecommended = item.id === recommendedId;
          return (
            <div
              key={item.id}
              className={cx(
                "rounded-2xl p-4 transition-colors",
                isConfirming
                  ? "bg-[#8B7CFF]/[0.08] ring-1 ring-[#8B7CFF]/40"
                  : isRecommended
                  ? "bg-white/[0.05] ring-1 ring-white/[0.14]"
                  : "bg-white/[0.025] ring-1 ring-white/[0.06]"
              )}
            >
              {isRecommended && (
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#B4A9FF]">
                  <Sparkles className="h-3 w-3" /> Recommended for you
                </p>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                    style={
                      item.kind === "repair"
                        ? { color: C.rose, background: `${C.rose}14` }
                        : { color: C.iris, background: `${C.iris}14` }
                    }
                  >
                    {item.kind === "repair" ? <><TrendingDown className="h-3 w-3" /> Close this gap</> : <><TrendingUp className="h-3 w-3" /> Go further</>}
                  </span>
                  <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{item.topic}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#8A8FA3]">{item.reason}</p>
                  <p className="mt-1.5 text-[11px] text-[#6E7389]">
                    Taught at <span className="text-[#B9BCCB]">{item.level}</span> level
                    {item.kind === "repair" ? " — back to first principles" : ` — matched to your ${pct}%`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                  {!affordable ? (
                    <button onClick={onRequestTopUp} className={cx(BTN_SOFT, "h-9 whitespace-nowrap")}>
                      <Zap className="h-3.5 w-3.5 text-[#FFB547]" /> Need {cost - balance} more
                    </button>
                  ) : isConfirming ? (
                    <>
                      <button
                        onClick={() => { setConfirming(null); onGenerate(item.topic, tierKey!, item.level, item.kind); }}
                        disabled={starting}
                        className={cx(BTN_PRIMARY, "h-9 whitespace-nowrap")}
                      >
                        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Spend {cost} credits
                      </button>
                      <button onClick={() => setConfirming(null)} className="text-[11px] text-[#6E7389] transition-colors hover:text-white">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirming(item.id)}
                        className={cx(isRecommended ? BTN_PRIMARY : BTN_SOFT, "h-10 whitespace-nowrap")}
                      >
                        {isRecommended
                          ? <>Start this course · {cost} credits <ArrowRight className="h-3.5 w-3.5" /></>
                          : <><Sparkles className="h-3.5 w-3.5 text-[#B4A9FF]" /> Generate · {cost} credits</>}
                      </button>
                      <span className="text-center text-[10px] text-[#4A4F63]">leaves you {balance - cost}</span>
                    </>
                  )}
                </div>
              </div>

              {isConfirming && (
                <p className="mt-3 border-t border-white/[0.07] pt-3 text-[11px] leading-relaxed text-[#B9BCCB]">
                  This spends <span className="font-semibold text-white">{cost} credits</span> and starts a new{" "}
                  {tier?.lessonCount}-lesson course on “{item.topic}”. Your balance goes from {balance} to {balance - cost}.
                  It builds <span className="text-white">just below this page</span> — you can keep reading your results while it does.
                </p>
              )}
            </div>
          );
        })}

        {/* Suggestions are one LLM call, so they're opt-in rather than
            fetched for everyone who merely lands on this page. */}
        {courseId && !suggestions && (
          <button
            onClick={loadSuggestions}
            disabled={loadingSuggestions}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/[0.1] px-4 py-4 text-left transition-colors hover:border-[#8B7CFF]/40 hover:bg-[#8B7CFF]/[0.04] disabled:opacity-60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8B7CFF]/15 ring-1 ring-[#8B7CFF]/30">
              {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin text-[#B4A9FF]" /> : <Sparkles className="h-4 w-4 text-[#B4A9FF]" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-white">
                {loadingSuggestions ? "Reading your results…" : "Suggest what to learn next"}
              </span>
              <span className="block text-[12px] text-[#8A8FA3]">Free — picks topics from this course and your score</span>
            </span>
          </button>
        )}

        {startError && (
          <p className="rounded-xl bg-[#FF5C6C]/10 px-4 py-3 text-[12px] text-[#FF8A95] ring-1 ring-inset ring-[#FF5C6C]/25">
            {startError}
          </p>
        )}

        {suggestions?.length === 0 && items.length === 0 && (
          <p className="rounded-2xl bg-white/[0.02] px-4 py-5 text-center text-[13px] text-[#6E7389]">
            Couldn't load suggestions right now — you can always start a new course from the composer.
          </p>
        )}
      </div>
    </div>
  );
}

function ResultsStage({
  answers, questions, serverResult, courseId, onFeedback,
  lessons, lessonStatuses, onSelectLesson,
  credits, courseTiers, onGenerateFollowUp, onRequestTopUp, starting, startError, lineage,
}: {
  answers: QuizAnswer[]; questions: MCQQuestion[]; serverResult?: QuizResult | null; courseId?: string | null; onFeedback: () => void;
  lessons: Lesson[]; lessonStatuses: LessonStatus[]; onSelectLesson: (i: number) => void;
  credits: Credits | null; courseTiers: CourseTier[] | null;
  onGenerateFollowUp: (topic: string, tierKey: string, level: Level, kind: "repair" | "extend") => void;
  onRequestTopUp: () => void;
  starting: boolean; startError: string | null;
  // Root → this course, for the growth comparison. Length 1 (just this
  // course) when it wasn't generated from another one's results.
  lineage: HistoryEntry[];
}) {
  // Prefer the server-graded result; client computation only bridges the round-trip.
  const clientScore = answers.filter((a) => { const q = questions.find((q) => q.id === a.questionId); return q && q.correct === a.selected; }).length;
  const clientPct = questions.length > 0 ? Math.round((clientScore / questions.length) * 100) : 0;
  const clientTopics = Object.entries(
    questions.reduce<Record<string, { correct: number; total: number }>>((acc, q) => {
      const ans = answers.find((a) => a.questionId === q.id);
      if (!acc[q.topic]) acc[q.topic] = { correct: 0, total: 0 };
      acc[q.topic].total++;
      if (ans && ans.selected === q.correct) acc[q.topic].correct++;
      return acc;
    }, {})
  ).map(([topic, data]) => ({ topic, ...data, pct: Math.round((data.correct / data.total) * 100) })).sort((a, b) => b.pct - a.pct);

  const score = serverResult?.score ?? clientScore;
  const total = serverResult?.total ?? questions.length;
  const pct = serverResult?.pct ?? clientPct;
  const topics = serverResult ? [...serverResult.topicBreakdown].sort((a, b) => b.pct - a.pct) : clientTopics;
  const strengths = topics.filter((t) => t.pct >= PASS_MARK);
  const weaknesses = topics.filter((t) => t.pct < PASS_MARK);
  const tone = readinessTone(pct);
  const readinessLabel = serverResult?.readinessLabel ?? tone.label;

  const improved = new Set(serverResult?.trend?.improvedTopics ?? []);
  const regressed = new Set(serverResult?.trend?.regressedTopics ?? []);

  // Quiz topics are the exact lesson titles (generateCourseQuiz copies them
  // character-for-character so results group back to the right lesson), which
  // is what makes "rewatch the lesson behind this gap" possible at all.
  const lessonIndexFor = (topic: string) => {
    const key = topic.trim().toLowerCase();
    return lessons.findIndex((l) => l.title.trim().toLowerCase() === key);
  };

  // Correct/wrong/skipped per question. After a page reload `answers` is empty
  // but the server result still names every missed question, so outcomes are
  // reconstructed from that instead of silently showing everything unanswered.
  const missedById = new Map((serverResult?.missedQuestions ?? []).map((m) => [m.questionId, m]));
  const outcomes: QuestionOutcome[] = questions.map((q, i) => {
    const ans = answers.find((a) => a.questionId === q.id);
    let status: QuestionOutcome["status"];
    if (ans) status = ans.selected === q.correct ? "correct" : "wrong";
    else if (serverResult) {
      const missed = missedById.get(q.id);
      status = !missed ? "correct" : missed.yourAnswer === null ? "skipped" : "wrong";
    } else status = "skipped";
    return { id: q.id, n: i + 1, topic: q.topic, status };
  });

  const [attempts, setAttempts] = useState<{ pct: number; submittedAt: string }[] | null>(null);
  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    getAttemptHistory(courseId)
      .then((rows) => { if (alive) setAttempts(rows.map((r) => ({ pct: r.pct, submittedAt: r.submittedAt }))); })
      .catch(() => { if (alive) setAttempts([]); });
    return () => { alive = false; };
  }, [courseId]);

  const balance = Math.max(credits?.spendableBalance ?? credits?.courseCredits ?? 0, 0);
  const watchedCount = lessons.filter((l) => l.completed).length;


  return (
    <div className="space-y-5">
      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <div className={cx(SURFACE, "lu-rise relative overflow-hidden p-6 sm:p-9")}>
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: tone.color }} />
        <div className="relative flex flex-col items-center gap-7 sm:flex-row sm:gap-10">
          <Ring value={pct} size={168} stroke={10} color={tone.color}>
            <div className="text-center">
              <p className="lu-serif text-6xl leading-none text-white">{pct}<span className="text-3xl text-[#6E7389]">%</span></p>
            </div>
          </Ring>
          <div className="min-w-0 text-center sm:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1" style={{ color: tone.color, background: `${tone.color}14`, borderColor: tone.color, boxShadow: `inset 0 0 0 1px ${tone.color}40` }}>
              <Trophy className="h-3.5 w-3.5" /> {readinessLabel}
            </span>
            <h2 className="lu-serif mt-3 text-4xl text-white sm:text-5xl">Your readiness score</h2>
            <p className="mt-1.5 text-[15px] text-[#8A8FA3]">{score} of {total} answered correctly</p>
            {serverResult?.trend && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#B9BCCB]">
                {serverResult.trend.delta >= 0
                  ? <TrendingUp className="h-4 w-4 text-[#3DDC97]" />
                  : <TrendingDown className="h-4 w-4 text-[#FF5C6C]" />}
                {serverResult.trend.delta > 0 ? "+" : ""}{serverResult.trend.delta}% vs. last attempt ({serverResult.trend.previousPct}%) · attempt #{serverResult.trend.attemptNumber}
              </p>
            )}
            {serverResult?.roomComparison && (
              <p className="mt-2 text-sm text-[#B9BCCB]">
                {serverResult.roomComparison.aboveAverage ? "Above" : "Below"} your group's average of{" "}
                <span className="font-semibold text-white">{serverResult.roomComparison.roomAveragePct}%</span>{" "}
                <span className="text-[#6E7389]">({serverResult.roomComparison.membersReporting} members reporting)</span>
              </p>
            )}
          </div>
        </div>

        <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="Correct" value={score} sub={`out of ${total} questions`} color={C.mint} />
          <KpiTile label="Missed" value={total - score} sub={outcomes.some((o) => o.status === "skipped") ? `${outcomes.filter((o) => o.status === "skipped").length} left blank` : "all answered"} color={total - score > 0 ? C.rose : undefined} />
          <KpiTile
            label="Topics at pass"
            value={`${strengths.length}/${topics.length}`}
            sub={`${PASS_MARK}% or better`}
            color={strengths.length === topics.length ? C.mint : undefined}
          />
          <KpiTile label="Lessons watched" value={`${watchedCount}/${lessons.length}`} sub={watchedCount < lessons.length ? "unwatched lessons hurt your score" : "full course covered"} />
        </div>
      </div>

      {/* ── How this course compares to the one before it ────────────────── */}
      <GrowthComparison
        lineage={lineage}
        currentPct={pct}
      />

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      {attempts && attempts.length >= 2 && <AttemptTrend attempts={attempts} />}

      {topics.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          {topics.length >= 3 && (
            <div className={cx(SURFACE, "flex flex-col items-center p-5 sm:p-6")}>
              <p className={cx(EYEBROW, "self-start")}>Accuracy by topic</p>
              <MasteryRadar topics={topics} />
              <p className="mt-1 text-center text-[11px] text-[#6E7389]">
                Numbers match the list below · dashed ring is the {PASS_MARK}% pass mark
              </p>
            </div>
          )}
          <div className={cx(SURFACE, "p-5 sm:p-6")}>
            <p className={cx(EYEBROW, "mb-4")}>Where you stand</p>
            <MasteryDonut topics={topics} />
            {(improved.size > 0 || regressed.size > 0) && (
              <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-4 text-[12px]">
                {improved.size > 0 && (
                  <p className="flex items-start gap-1.5 text-[#8A8FA3]">
                    <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: C.mint }} />
                    <span>Improved since last attempt: <span className="text-[#D6D8E2]">{[...improved].join(", ")}</span></span>
                  </p>
                )}
                {regressed.size > 0 && (
                  <p className="flex items-start gap-1.5 text-[#8A8FA3]">
                    <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: C.rose }} />
                    <span>Slipped since last attempt: <span className="text-[#D6D8E2]">{[...regressed].join(", ")}</span></span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Topic detail ─────────────────────────────────────────────────── */}
      <div className={cx(SURFACE, "p-5 sm:p-7")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={EYEBROW}>Topic breakdown</p>
          <p className="text-[11px] text-[#6E7389]">Each topic is one lesson of this course</p>
        </div>
        <div className="mt-5 space-y-4">
          {topics.map(({ topic, pct: tPct, correct, total: tTotal }, i) => {
            const band = bandFor(tPct);
            const li = lessonIndexFor(topic);
            const canRewatch = li >= 0 && lessonStatuses[li] === "ready";
            return (
              <div key={topic}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] font-mono text-[10px] text-[#8A8FA3]">{i + 1}</span>
                    <span className="truncate font-medium text-[#E3E5EE]">{topic}</span>
                    {improved.has(topic) && (
                      <span className="shrink-0" title="Improved since last attempt">
                        <TrendingUp className="h-3.5 w-3.5" style={{ color: C.mint }} />
                      </span>
                    )}
                    {regressed.has(topic) && (
                      <span className="shrink-0" title="Slipped since last attempt">
                        <TrendingDown className="h-3.5 w-3.5" style={{ color: C.rose }} />
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: band.color, background: `${band.color}14` }}>{band.label}</span>
                    <span className="font-mono text-xs tabular-nums" style={{ color: band.color }}>{correct}/{tTotal} · {tPct}%</span>
                  </span>
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${tPct}%`, background: band.color }} />
                  <span className="absolute top-0 h-full w-px bg-white/25" style={{ left: `${PASS_MARK}%` }} aria-hidden="true" />
                </div>
                {canRewatch && tPct < PASS_MARK && (
                  <button
                    onClick={() => onSelectLesson(li)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#B4A9FF] transition-colors hover:text-white"
                  >
                    <Play className="h-3 w-3" /> Rewatch lesson {li + 1}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {outcomes.length > 0 && <QuestionMap outcomes={outcomes} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: "Strengths", items: strengths, color: C.mint, Icon: TrendingUp, empty: "Keep studying — strengths will emerge." },
          { title: "Needs review", items: weaknesses, color: C.rose, Icon: TrendingDown, empty: "Excellent — no weak areas detected." },
        ].map(({ title, items, color, Icon, empty }) => (
          <div key={title} className={cx(SURFACE, "p-5")}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color }}><Icon className="h-4 w-4" /> {title}</p>
            {items.length === 0 ? (
              <p className="mt-3 text-sm text-[#6E7389]">{empty}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {items.map(({ topic, pct: tPct }) => (
                  <li key={topic} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-[#D6D8E2]">{topic}</span>
                    <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px]" style={{ color, background: `${color}14` }}>{tPct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {serverResult && serverResult.missedQuestions.length > 0 && (
        <div className={cx(SURFACE, "p-5 sm:p-7")}>
          <p className={EYEBROW}>Review missed questions · {serverResult.missedQuestions.length}</p>
          <div className="mt-4 space-y-3">
            {serverResult.missedQuestions.map((m) => {
              const li = lessonIndexFor(m.topic);
              return (
                <div key={m.questionId} className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-[#8A8FA3]">{m.topic}</span>
                    {li >= 0 && lessonStatuses[li] === "ready" && (
                      <button
                        onClick={() => onSelectLesson(li)}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-[#B4A9FF] transition-colors hover:text-white"
                      >
                        <Play className="h-2.5 w-2.5" /> lesson {li + 1}
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-white">{m.question}</p>
                  <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                    <p className="flex items-start gap-1.5 text-[#8A8FA3]"><X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF5C6C]" /><span>You: <span className="text-[#FF8A95]">{m.yourAnswer ?? "No answer"}</span></span></p>
                    <p className="flex items-start gap-1.5 text-[#8A8FA3]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3DDC97]" /><span>Correct: <span className="text-[#7BE8B8]">{m.correctAnswer}</span></span></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── The next loop, after the full result ─────────────────────────── */}
      <ContinueLearning
        weakTopics={weaknesses}
        pct={pct}
        courseId={courseId}
        tiers={courseTiers}
        balance={balance}
        onGenerate={onGenerateFollowUp}
        onRequestTopUp={onRequestTopUp}
        starting={starting}
        startError={startError}
      />

      <div className={cx(SURFACE, "flex flex-col items-start gap-2 p-5 sm:flex-row sm:items-center sm:justify-between")}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] ring-1 ring-white/[0.08]">
            <MessageSquare className="h-4 w-4 text-[#E3E5EE]" />
          </span>
          <div>
            <p className="lu-serif text-2xl text-white">How was this course?</p>
            <p className="text-xs text-[#8A8FA3]">Your feedback shapes what we build next — takes a minute.</p>
          </div>
        </div>
        <button onClick={onFeedback} className={cx(BTN_SOFT, "h-9 shrink-0")}>Share feedback</button>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account menu (custom popover)
// ─────────────────────────────────────────────────────────────────────────────

function AccountMenu({ user, onLogout, compact = false }: { user: SessionUser; onLogout: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!user) return null;
  const initial = user.name?.charAt(0).toUpperCase() || "?";
  const avatar = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] text-sm font-bold text-[#0A0B10]">{initial}</span>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx("flex items-center gap-2.5 rounded-xl transition-colors hover:bg-white/[0.05]", compact ? "p-1" : "w-full px-2 py-2 text-left")}
      >
        {avatar}
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">{user.name}</span>
              <span className="block truncate text-[11px] text-[#6E7389]">{user.email}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[#6E7389]" />
          </>
        )}
      </button>
      {open && (
        <div
          className={cx(
            "lu-rise absolute z-50 w-64 rounded-2xl bg-[#171920] p-1.5 shadow-2xl ring-1 ring-white/10",
            compact ? "bottom-0 left-full ml-2" : "bottom-full left-0 mb-2"
          )}
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-xs text-[#6E7389]">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-white/[0.06]" />
          <Link to="/profile" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#D6D8E2] transition-colors hover:bg-white/[0.06] hover:text-white">
            <UserIcon className="h-4 w-4 text-[#B4A9FF]" /> Profile
          </Link>
          <button onClick={onLogout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#FF8A95] transition-colors hover:bg-[#FF5C6C]/10">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen block while a follow-up course is being started. Spending
 * credits is the one irreversible thing this page does, so the whole UI goes
 * inert for the round-trip rather than relying on a disabled button — a
 * second click on anything (another card, the depth selector, the composer)
 * can't start a second course or navigate mid-request.
 *
 * Captures focus and swallows keyboard activation too, so Tab+Enter can't
 * reach what the backdrop covers.
 */
function StartingOverlay({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => document.removeEventListener("keydown", trap, true);
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-busy="true"
      aria-label={label}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#05060A]/80 outline-none backdrop-blur-md"
    >
      <div className={cx(SURFACE, "lu-rise flex w-full max-w-xs flex-col items-center p-7 text-center")}>
        <span className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#8B7CFF]/20" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8B7CFF]/15 ring-1 ring-[#8B7CFF]/30">
            <Loader2 className="h-5 w-5 animate-spin text-[#B4A9FF]" />
          </span>
        </span>
        <p className="lu-serif mt-5 text-2xl leading-tight text-white">Starting your next course</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#8A8FA3]">{label}</p>
        <p className="mt-3 text-[11px] text-[#555A6E]">Don't close this tab — it only takes a moment.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Follow-up thread — the courses this course led to
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Learning path — the chain of courses one results page led to
//
// A chain is ONE page and ONE syllabus. The course the user opened renders its
// full stage in the middle; everything it came from renders as a player card
// above it, and everything it led to renders as a player card below. Opening a
// follow-up therefore never strands it on its own — whichever link you open,
// the course before it is still sitting above.
// ─────────────────────────────────────────────────────────────────────────────

const FOLLOW_UP_TONE = {
  repair: { color: C.rose, label: "Gap closed", Icon: TrendingDown },
  extend: { color: C.iris, label: "Went further", Icon: TrendingUp },
} as const;

function followUpTone(kind?: "repair" | "extend" | null) {
  return kind === "repair" ? FOLLOW_UP_TONE.repair : FOLLOW_UP_TONE.extend;
}

/**
 * Where you are in the thread, always on screen.
 *
 * Everything else in this column is drawn RELATIVE to the open course — the
 * course above it, the ones building from it — so opening the fourth course of
 * eight made the first three disappear and nothing said which one you were on.
 * This is the one element that shows the whole chain regardless of which link
 * is open, marks the current one, and jumps to any other.
 *
 * Sticky, because "which topic am I on" is a question you ask halfway down a
 * lesson, not at the top of the page.
 */
function PathBreadcrumb({
  steps, activeId, onOpen,
}: {
  steps: HistoryEntry[];
  activeId: string | null;
  onOpen: (entry: HistoryEntry) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const activeIndex = steps.findIndex((s) => s.id === activeId);

  // Keep the current step visible when the strip is wider than the viewport —
  // scrolls the strip only, never the page.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  if (steps.length < 2) return null;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-white/[0.06] bg-[#0A0B10]/92 px-4 py-2.5 backdrop-blur-xl sm:-mx-8 sm:px-8">
      <div className="flex items-baseline gap-2">
        <span className={EYEBROW}>Your path</span>
        {activeIndex >= 0 && (
          <span className="text-[11px] tabular-nums text-[#6E7389]">
            step {activeIndex + 1} of {steps.length}
          </span>
        )}
      </div>

      <div className="lu-scroll mt-1.5 flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const isActive = step.id === activeId;
          const statuses = step.lessonStatuses ?? [];
          const building = statuses.length === 0 || statuses.some((s) => s === "generating");
          return (
            <div key={step.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[#3E4253]" aria-hidden="true" />}
              <button
                ref={isActive ? activeRef : undefined}
                onClick={() => !isActive && onOpen(step)}
                aria-current={isActive ? "step" : undefined}
                title={cleanName(step.fileName)}
                className={cx(
                  "flex max-w-[190px] shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                  isActive
                    ? "cursor-default bg-[#8B7CFF] text-[#0A0B10]"
                    : "bg-white/[0.04] text-[#B9BCCB] ring-1 ring-inset ring-white/[0.06] hover:bg-white/[0.09] hover:text-white"
                )}
              >
                <span
                  className={cx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold",
                    isActive ? "bg-[#0A0B10]/25 text-[#0A0B10]" : "bg-white/[0.07] text-[#8A8FA3]"
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate text-[12px] font-medium">{cleanName(step.fileName)}</span>
                {building ? (
                  <Loader2 className={cx("h-3 w-3 shrink-0 animate-spin", isActive ? "text-[#0A0B10]" : "text-[#FFB08A]")} />
                ) : step.quizScore !== null ? (
                  <span
                    className="shrink-0 font-mono text-[10px]"
                    style={{ color: isActive ? "#0A0B10" : bandFor(step.quizScore).color }}
                  >
                    {step.quizScore}%
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Library rail (course history)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row of the library rail. `depth > 0` means this course was generated
 * from the one above it, which the caller draws as an indented branch off the
 * parent (see the rail container in LibraryRail).
 *
 * `orphanParentTitle` covers the case the tree can't: a follow-up whose parent
 * landed in a different date group (generate a follow-up a week later and the
 * two are no longer neighbours). Rather than tear the groups apart or silently
 * drop the relation, that row stays at top level and names its parent inline.
 */
function RailRow({
  entry, isActive, depth, childCount, orphanParentTitle, onSelect, onDelete,
}: {
  entry: HistoryEntry;
  isActive: boolean;
  depth: number;
  childCount: number;
  orphanParentTitle: string | null;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const generating = entry.lessonStatuses?.some((s) => s === "generating");
  const tone = followUpTone(entry.followUpKind);
  const isChild = depth > 0;

  return (
    <div
      className={cx(
        "group/item relative flex items-center rounded-xl transition-colors",
        isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
      )}
    >
      {/* Elbow into the parent's rail. */}
      {isChild && <span className="absolute -left-2.5 top-1/2 h-px w-2.5 bg-white/[0.09]" aria-hidden="true" />}
      {isActive && <span className="absolute left-0 bottom-2 top-2 w-[3px] rounded-full bg-[#8B7CFF]" />}

      <button onClick={onSelect} className="min-w-0 flex-1 px-3 py-2.5 text-left">
        <p className={cx("flex items-center gap-1.5 pr-6", isChild ? "text-[12px]" : "text-[13px]")}>
          {isChild && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tone.color }}
              title={entry.followUpKind === "repair" ? "Started to close a gap in the parent course" : "Started to go further than the parent course"}
            />
          )}
          <span className={cx("line-clamp-1 leading-snug", isActive ? "font-medium text-white" : isChild ? "text-[#A2A7BA]" : "text-[#B9BCCB]")}>
            {cleanName(entry.fileName)}
          </span>
        </p>

        {orphanParentTitle && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-[#555A6E]">
            <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
            <span className="line-clamp-1">from {cleanName(orphanParentTitle)}</span>
          </p>
        )}

        {(generating || entry.quizScore !== null || childCount > 0) && (
          <p className="mt-1 flex items-center gap-2 text-[11px]">
            {generating && <span className="flex items-center gap-1.5 text-[#FFB08A]"><RecDot /> Generating</span>}
            {entry.quizScore !== null && <span className="font-mono text-[#3DDC97]">Quiz {entry.quizScore}%</span>}
            {childCount > 0 && (
              <span
                className="flex items-center gap-0.5 text-[#6E7389]"
                title={`Led to ${childCount} follow-up course${childCount === 1 ? "" : "s"}`}
              >
                <CornerDownRight className="h-3 w-3" />{childCount}
              </span>
            )}
          </p>
        )}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-1.5 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-[#6E7389] opacity-0 transition-all hover:bg-[#FF5C6C]/10 hover:text-[#FF5C6C] group-hover/item:opacity-100 focus:opacity-100"
        aria-label="Delete course"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function LibraryRail({ history, activeId, onSelect, onNew, onDelete, collapsed, onToggle, loading, error, credits, onBuy, isMobile, onFeedback, hasMore, loadingMore, onLoadMore, user, onLogout }: {
  history: HistoryEntry[]; activeId: string | null;
  onSelect: (entry: HistoryEntry) => void; onNew: () => void;
  onDelete: (id: string) => void; collapsed: boolean; onToggle: () => void;
  loading: boolean; error: boolean;
  credits: Credits | null; onBuy: () => void;
  isMobile?: boolean;
  onFeedback: () => void;
  hasMore: boolean; loadingMore: boolean; onLoadMore: () => void;
  user: SessionUser; onLogout: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredHistory = trimmedQuery ? history.filter((e) => e.fileName.toLowerCase().includes(trimmedQuery)) : history;

  const groups = filteredHistory.reduce<Record<string, HistoryEntry[]>>((acc, e) => {
    const diffDays = Math.floor((Date.now() - e.createdAt.getTime()) / 86400000);
    const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : diffDays <= 7 ? "Previous 7 days" : diffDays <= 30 ? "Previous 30 days" : e.createdAt.toLocaleString("default", { month: "long", year: "numeric" });
    if (!acc[label]) acc[label] = [];
    acc[label].push(e);
    return acc;
  }, {});
  const groupOrder = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days"];
  const sortedGroups = [...groupOrder.filter((g) => groups[g]), ...Object.keys(groups).filter((g) => !groupOrder.includes(g))];

  // Lineage, resolved against the WHOLE history (not the current filter), so a
  // parent that's scrolled off or filtered out can still be named.
  const byId = new Map(history.map((e) => [e.id, e]));
  const childCountOf = history.reduce<Record<string, number>>((acc, e) => {
    if (e.parentCourseId) acc[e.parentCourseId] = (acc[e.parentCourseId] ?? 0) + 1;
    return acc;
  }, {});

  const balance = Math.max(credits?.spendableBalance ?? credits?.courseCredits ?? 0, 0);
  const bonus = Math.max(credits?.signupBonusCredits ?? 0, 0);
  const outOfCredits = !!credits && !credits.canGenerate;

  // Desktop collapsed → slim icon rail.
  if (!isMobile && collapsed) {
    return (
      <aside className="flex h-screen w-[68px] shrink-0 flex-col items-center gap-1.5 border-r border-white/[0.06] bg-[#0C0D13] py-3">
        <Logo size={34} />
        <div className="my-2 h-px w-8 bg-white/[0.06]" />
        <button onClick={onToggle} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#8A8FA3] transition-colors hover:bg-white/[0.06] hover:text-white" title="Open library">
          <PanelLeft className="h-4 w-4" />
        </button>
        <button onClick={onNew} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.1]" title="New course">
          <Plus className="h-4 w-4" />
        </button>
        <Link to="/gallery" className="flex h-10 w-10 items-center justify-center rounded-xl text-[#8A8FA3] transition-colors hover:bg-white/[0.06] hover:text-white" title="Gallery">
          <Film className="h-4 w-4" />
        </Link>
        <Link to="/collab" className="flex h-10 w-10 items-center justify-center rounded-xl text-[#8A8FA3] transition-colors hover:bg-white/[0.06] hover:text-white" title="Study with a friend">
          <Users className="h-4 w-4" />
        </Link>
        {credits && (
          <button onClick={onBuy} className="mt-2 flex flex-col items-center rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.05]" title="Credits">
            <Zap className={cx("h-4 w-4", outOfCredits ? "text-[#FF5C6C]" : "text-[#FFB547]")} />
            <span className="mt-0.5 font-mono text-[10px] font-semibold text-white">{balance}</span>
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onFeedback} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#8A8FA3] transition-colors hover:bg-white/[0.06] hover:text-white" title="Send feedback">
          <MessageSquare className="h-4 w-4" />
          {credits && !credits.feedbackCreditGranted && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#FFB547]" />}
        </button>
        <AccountMenu user={user} onLogout={onLogout} compact />
      </aside>
    );
  }

  const panel = (
    <aside
      className={cx(
        "flex h-full min-h-0 flex-col border-r border-white/[0.06] bg-[#0C0D13] text-[#ECEDF2]",
        isMobile ? "w-[84vw] max-w-[300px]" : "h-screen w-[280px] shrink-0"
      )}
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="lu-serif text-xl text-white">Level Up</span>
        </div>
        <button onClick={onToggle} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8A8FA3] transition-colors hover:bg-white/[0.06] hover:text-white" aria-label="Close library">
          {isMobile ? <X className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className="px-3 space-y-1.5">
        <button onClick={onNew} className="flex h-10 w-full items-center gap-2 rounded-xl bg-white/[0.05] px-3 text-[13px] font-medium text-white ring-1 ring-white/[0.08] transition-all hover:bg-white/[0.09]">
          <Plus className="h-4 w-4 text-[#B4A9FF]" /> New course
        </button>
        <Link to="/gallery" className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[#D6D8E2] transition-colors hover:bg-white/[0.06] hover:text-white">
          <Film className="h-4 w-4 text-[#8A8FA3]" /> Gallery
        </Link>
        <Link to="/collab" className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[#D6D8E2] transition-colors hover:bg-white/[0.06] hover:text-white">
          <Users className="h-4 w-4 text-[#8A8FA3]" /> Study with a friend
        </Link>
      </div>

      {credits && (
        <div className="mx-3 mt-3 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.015] p-3.5 ring-1 ring-white/[0.07]">
          <div className="flex items-center justify-between">
            <span className={EYEBROW}>Credits</span>
            <Zap className={cx("h-3.5 w-3.5", outOfCredits ? "text-[#FF5C6C]" : "text-[#FFB547]")} />
          </div>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">
            {balance}<span className="ml-1.5 text-xs font-medium text-[#6E7389]">remaining</span>
          </p>
          {bonus > 0 && (
            <div className="mt-2.5">
              <div className="mb-1 flex justify-between text-[10px] text-[#8A8FA3]">
                <span>Free signup credits</span><span className="font-mono">{bonus}/100</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-[#3DDC97]" style={{ width: `${Math.min(bonus, 100)}%` }} />
              </div>
            </div>
          )}
          <button
            onClick={onBuy}
            className={cx(
              "mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all",
              outOfCredits ? "bg-[#8B7CFF] text-[#0A0B10] hover:bg-[#A093FF]" : "text-[#C3BAFF] ring-1 ring-[#8B7CFF]/30 hover:bg-[#8B7CFF]/10"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Need more credits?
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="px-3 pb-1 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555A6E]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your courses"
              className="h-9 w-full rounded-xl bg-white/[0.03] pl-8 pr-8 text-xs text-white ring-1 ring-white/[0.07] transition-all placeholder:text-[#555A6E] focus:outline-none focus:ring-[#8B7CFF]/50"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-[#6E7389] hover:bg-white/10 hover:text-white" aria-label="Clear search">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="lu-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {history.length === 0 ? (
          <div className="px-4 py-10 text-center">
            {loading ? (
              <div className="space-y-2.5 text-left">
                {[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-9 w-full rounded-lg" delay={i * 0.12} />)}
              </div>
            ) : error ? (
              <>
                <AlertCircle className="mx-auto mb-2 h-6 w-6 text-[#FF5C6C]/70" />
                <p className="text-xs font-medium text-[#FF8A95]">Failed to load courses</p>
                <p className="mt-1 text-xs text-[#6E7389]">Check your connection and try again.</p>
              </>
            ) : (
              <>
                <GraduationCap className="mx-auto mb-2 h-7 w-7 text-[#3E4253]" />
                <p className="text-xs text-[#8A8FA3]">Your library is empty.</p>
                <p className="mt-0.5 text-xs text-[#555A6E]">Generate a course to get started.</p>
              </>
            )}
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Search className="mx-auto mb-2 h-6 w-6 text-[#3E4253]" />
            <p className="text-xs text-[#8A8FA3]">No courses match “{searchQuery.trim()}”.</p>
          </div>
        ) : sortedGroups.map((group) => {
          // A follow-up nests under its parent only when both are in the same
          // date group; otherwise it stays a root and names its parent inline,
          // which keeps "Today / Yesterday / …" meaning what it says.
          const entries = groups[group];
          const idsHere = new Set(entries.map((e) => e.id));
          const nestedUnder = (e: HistoryEntry) => !!e.parentCourseId && idsHere.has(e.parentCourseId);
          const kidsOf = (id: string) => entries.filter((e) => e.parentCourseId === id);

          const renderEntry = (entry: HistoryEntry, depth: number): ReactNode => {
            const kids = kidsOf(entry.id);
            const parent = entry.parentCourseId ? byId.get(entry.parentCourseId) : undefined;
            return (
              <div key={entry.id}>
                <RailRow
                  entry={entry}
                  isActive={entry.id === activeId}
                  depth={depth}
                  childCount={childCountOf[entry.id] ?? 0}
                  orphanParentTitle={depth === 0 && parent ? parent.fileName : null}
                  onSelect={() => onSelect(entry)}
                  onDelete={() => {
                    if (window.confirm(`Delete "${cleanName(entry.fileName)}"? This cannot be undone.`)) onDelete(entry.id);
                  }}
                />
                {kids.length > 0 && depth < 3 && (
                  <div className="relative ml-[18px] border-l border-white/[0.08] pl-2.5">
                    {kids.map((kid) => renderEntry(kid, depth + 1))}
                  </div>
                )}
              </div>
            );
          };

          return (
            <div key={group} className="mb-2">
              <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#555A6E]">{group}</p>
              {entries.filter((e) => !nestedUnder(e)).map((entry) => renderEntry(entry, 0))}
            </div>
          );
        })}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="mx-auto mb-2 flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-[#8A8FA3] transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            {loadingMore ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</> : "Show more"}
          </button>
        )}
      </nav>

      <div className="space-y-2 border-t border-white/[0.06] p-3">
        <ReferralCard />
        <button
          onClick={onFeedback}
          className="relative flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#3DDC97]/[0.08] text-[13px] font-semibold text-[#7BE8B8] ring-1 ring-[#3DDC97]/25 transition-all hover:bg-[#3DDC97]/[0.14]"
        >
          <MessageSquare className="h-4 w-4" /> Send feedback
          {credits && !credits.feedbackCreditGranted && (
            <span className="absolute -right-1.5 -top-2 flex items-center gap-1 rounded-full bg-[#FFB547] px-1.5 py-0.5 text-[10px] font-extrabold text-[#2A1A00] shadow">
              <Gift className="h-2.5 w-2.5" /> +20
            </span>
          )}
        </button>
        <AccountMenu user={user} onLogout={onLogout} />
      </div>
    </aside>
  );

  if (!isMobile) return panel;

  return (
    <>
      {!collapsed && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={onToggle} />}
      <div className={cx("fixed inset-y-0 left-0 z-40 transition-transform duration-300", collapsed ? "-translate-x-full" : "translate-x-0")}>
        {panel}
      </div>
    </>
  );
}

/**
 * One lesson row. Shared by every course in the path so a lesson looks and
 * behaves the same whether it belongs to the course whose stage is open or to
 * one playing in a card above/below it — the whole point of having a single
 * syllabus instead of one per course.
 */
function SyllabusLessonRow({
  lesson, index, status, isActive, progress, compact, onSelect,
}: {
  lesson: Lesson;
  index: number;
  status: LessonStatus | undefined;
  isActive: boolean;
  progress?: number;
  compact?: boolean;
  onSelect: () => void;
}) {
  const locked = status === "locked";
  const playable = status === "ready";
  const size = compact ? "h-7 w-7" : "h-8 w-8";

  return (
    <li>
      <button
        disabled={locked || status === "generating"}
        onClick={() => { if (playable) onSelect(); }}
        className={cx(
          "relative flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors",
          isActive ? "bg-[#8B7CFF]/[0.1]" : locked || status === "generating" ? "cursor-not-allowed opacity-60" : "hover:bg-white/[0.04]"
        )}
      >
        <span className="relative z-10 shrink-0">
          {lesson.completed && playable ? (
            <span className={cx("flex items-center justify-center rounded-full bg-[#3DDC97]/15 ring-1 ring-[#3DDC97]/40", size)}>
              <Check className="h-3.5 w-3.5 text-[#3DDC97]" strokeWidth={3} />
            </span>
          ) : locked ? (
            <span className={cx("flex items-center justify-center rounded-full bg-[#FFB547]/10 ring-1 ring-[#FFB547]/30", size)}>
              <Lock className="h-3.5 w-3.5 text-[#FFB547]" />
            </span>
          ) : status === "failed" ? (
            <span className={cx("flex items-center justify-center rounded-full bg-[#FF5C6C]/10 ring-1 ring-[#FF5C6C]/30", size)}>
              <XCircle className="h-3.5 w-3.5 text-[#FF5C6C]" />
            </span>
          ) : status === "generating" ? (
            <span className="block rounded-full bg-[#0C0D13]">
              <Ring value={progress ?? 0} size={compact ? 28 : 32} stroke={2.5} color={C.ember}>
                <span className="font-mono text-[9px] font-semibold text-[#FFB08A]">{Math.round(progress ?? 0)}</span>
              </Ring>
            </span>
          ) : isActive ? (
            <span className={cx("flex items-center justify-center rounded-full bg-[#8B7CFF] shadow-[0_0_20px_-2px_rgba(139,124,255,0.8)]", size)}>
              <Play className="ml-0.5 h-3 w-3 fill-[#0A0B10] text-[#0A0B10]" />
            </span>
          ) : (
            <span className={cx("flex items-center justify-center rounded-full bg-[#0C0D13] font-mono text-[11px] text-[#8A8FA3] ring-1 ring-white/[0.12]", size)}>
              {pad2(index + 1)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className={cx("line-clamp-2 leading-snug", compact ? "text-[12px]" : "text-[13px]", isActive ? "font-semibold text-white" : status === "failed" ? "text-[#FF8A95]" : "text-[#D6D8E2]")}>
            {lesson.title}
          </span>
          <span className="mt-1 block text-[11px]">
            {locked ? (
              <span className="text-[#FFB547]">Contact us to unlock</span>
            ) : status === "generating" ? (
              <span className="text-[#FFB08A]">Generating…</span>
            ) : status === "failed" ? (
              <span className="text-[#FF8A95]">Generation failed</span>
            ) : lessonDuration(lesson) ? (
              <span className="flex items-center gap-1 text-[#6E7389]"><Clock className="h-3 w-3" /> {lessonDuration(lesson)}</span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The whole learning path in one panel: every course in the chain, in order,
 * with all of its lessons clickable from the same place. Previously each
 * course carried its own syllabus, so two generations in the same path were
 * two unrelated navigations.
 *
 * A lesson of the open course drives the main stage; a lesson of any other
 * course drives that course's inline player (above the stage if it came
 * before, below if it came after). Either way the user never leaves the page.
 */
function SyllabusPanel({
  open, isMobile, onClose, loading, lessons, lessonStatuses, lessonProgresses, activeSection, activeLesson,
  allLessonsReady, quizDone, quizCount, quizScore, onSelectLesson, onSelectQuiz, onSelectResults,
  activeTopic, pathBefore, pathAfter, onSelectPathLesson, onOpenCourse,
}: {
  open: boolean; isMobile: boolean; onClose: () => void; loading: boolean;
  lessons: Lesson[]; lessonStatuses: LessonStatus[]; lessonProgresses: number[];
  activeSection: CourseSection; activeLesson: number; allLessonsReady: boolean; quizDone: boolean;
  quizCount: number; quizScore: number | null;
  onSelectLesson: (i: number) => void; onSelectQuiz: () => void; onSelectResults: () => void;
  /** Title of the course whose stage is open. */
  activeTopic: string;
  /** Courses before it in the chain, oldest first; and the ones after it. */
  pathBefore: HistoryEntry[];
  pathAfter: HistoryEntry[];
  onSelectPathLesson: (courseId: string, lesson: number) => void;
  /** Opens another course of the path, optionally straight to a section. */
  onOpenCourse: (entry: HistoryEntry, section?: CourseSection) => void;
}) {
  const hasPath = pathBefore.length > 0 || pathAfter.length > 0;

  // In a deep thread the "next" courses are no longer all children of the open
  // one — a grandchild listed flat under its grandparent reads as a sibling
  // unless it names where it actually came from.
  // Same numbering the breadcrumb uses, so "step 4 of 8" up there and the
  // chips in here refer to the same thing.
  const stepOf = (entry: HistoryEntry) => {
    const before = pathBefore.findIndex((c) => c.id === entry.id);
    if (before >= 0) return before + 1;
    const after = pathAfter.findIndex((c) => c.id === entry.id);
    if (after >= 0) return pathBefore.length + 2 + after;
    return null;
  };
  const activeStep = pathBefore.length + 1;
  const totalSteps = pathBefore.length + 1 + pathAfter.length;

  const parentNameOf = (entry: HistoryEntry) => {
    if (!entry.parentCourseId) return null;
    const direct = [...pathBefore, ...pathAfter].find((c) => c.id === entry.parentCourseId);
    return direct ? cleanName(direct.fileName) : null;
  };

  const courseBlock = (entry: HistoryEntry, relation: "previous" | "next") => {
    const statuses = entry.lessonStatuses ?? [];
    const tone = followUpTone(entry.followUpKind);
    const readyCount = statuses.filter((st) => st === "ready").length;
    const generating = statuses.length === 0 || statuses.some((st) => st === "generating");

    return (
      <div key={entry.id} className="mt-5">
        <div className="mb-1.5 flex items-center gap-1.5 px-2">
          <CornerDownRight
            className={cx("h-3.5 w-3.5 shrink-0", relation === "previous" && "rotate-180")}
            style={relation === "next" ? { color: tone.color } : { color: "#6E7389" }}
          />
          <p className={cx(EYEBROW, "min-w-0 truncate text-[10px]")}>
            {relation === "previous"
              ? "Came before"
              : entry.followUpKind === "repair" ? "Gap you went back for" : "Where you went next"}
          </p>
        </div>

        <button onClick={() => onOpenCourse(entry)} className="w-full px-2 text-left">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-white">
            {stepOf(entry) !== null && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white/[0.07] font-mono text-[9px] font-bold text-[#8A8FA3]">
                {stepOf(entry)}
              </span>
            )}
            <span className="truncate hover:underline">{cleanName(entry.fileName)}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#6E7389]">
            {generating
              ? statuses.length === 0 ? "Planning lessons…" : `Building · ${readyCount}/${statuses.length} ready`
              : `${statuses.length} lesson${statuses.length === 1 ? "" : "s"}${entry.quizScore !== null ? ` · quiz ${entry.quizScore}%` : ""}`}
          </p>
          {relation === "next" && parentNameOf(entry) && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-[#555A6E]">
              <CornerDownRight className="h-2.5 w-2.5 shrink-0" /> from {parentNameOf(entry)}
            </p>
          )}
        </button>

        <ol className="relative ml-[18px] mt-1 border-l border-white/[0.08] pl-1">
          {entry.lessons.map((lesson, i) => (
            <div key={lesson.id} className="relative">
              <span className="absolute -left-1 top-1/2 h-px w-1 bg-white/[0.09]" aria-hidden="true" />
              <SyllabusLessonRow
                lesson={lesson}
                index={i}
                status={statuses[i]}
                isActive={false}
                compact
                onSelect={() => onSelectPathLesson(entry.id, i)}
              />
            </div>
          ))}

          {/* This course's own assessment, on the same rail as its lessons —
              a quiz lives where the lessons it tests live, rather than behind
              a button on the card further down the page. Opening it is the
              one thing that does switch the stage, since a quiz can't be
              taken inline. */}
          <div className="relative">
            <span className="absolute -left-1 top-1/2 h-px w-1 bg-white/[0.09]" aria-hidden="true" />
            <button
              disabled={generating}
              onClick={() => onOpenCourse(entry, entry.quizDone ? "results" : "quiz")}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
                generating ? "cursor-not-allowed opacity-50" : "hover:bg-white/[0.04]"
              )}
            >
              <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1", entry.quizDone ? "bg-[#3DDC97]/10 ring-[#3DDC97]/30" : "bg-white/[0.03] ring-white/[0.1]")}>
                {entry.quizDone
                  ? <Trophy className="h-3.5 w-3.5 text-[#FFB547]" />
                  : <ClipboardList className={cx("h-3.5 w-3.5", generating ? "text-[#6E7389]" : "text-[#B9BCCB]")} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-white">
                  {entry.quizDone ? "Results" : "Final quiz"}
                </span>
                <span className="block text-[10px] text-[#6E7389]">
                  {generating
                    ? "After its lessons"
                    : entry.quizScore !== null
                    ? `Readiness ${entry.quizScore}%`
                    : entry.questions.length > 0
                    ? `${entry.questions.length} question${entry.questions.length === 1 ? "" : "s"}`
                    : entry.mcqCount
                    ? `${entry.mcqCount} questions`
                    : "Questions coming"}
                </span>
              </span>
              {generating ? <Lock className="h-3 w-3 shrink-0 text-[#555A6E]" /> : <ArrowRight className="h-3 w-3 shrink-0 text-[#6E7389]" />}
            </button>
          </div>
        </ol>
      </div>
    );
  };

  const body = (
    <aside className={cx("flex h-full min-h-0 flex-col border-l border-white/[0.06] bg-[#0C0D13] text-[#ECEDF2]", isMobile ? "w-[86vw] max-w-[320px]" : "w-[320px]")}>
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <p className={EYEBROW}>{hasPath ? "Learning path" : "Syllabus"}</p>
        {isMobile && (
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8A8FA3] hover:bg-white/[0.06] hover:text-white" aria-label="Close syllabus">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="lu-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {pathBefore.map((entry) => courseBlock(entry, "previous"))}

        {hasPath && (
          <div className="mb-1.5 mt-5 flex items-center gap-1.5 px-2">
            <Play className="h-3 w-3 shrink-0 fill-[#B4A9FF] text-[#B4A9FF]" />
            <p className={cx(EYEBROW, "min-w-0 flex-1 truncate text-[10px] text-[#B4A9FF]")}>Open now</p>
            <span className="shrink-0 text-[10px] tabular-nums text-[#6E7389]">step {activeStep} of {totalSteps}</span>
          </div>
        )}
        {hasPath && (
          <p className="mb-1 flex items-center gap-1.5 px-2 text-[13px] font-medium text-white">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#8B7CFF] font-mono text-[9px] font-bold text-[#0A0B10]">
              {activeStep}
            </span>
            <span className="truncate">{cleanName(activeTopic)}</span>
          </p>
        )}

        {loading ? (
          <div className="space-y-3 px-2 pt-2" aria-hidden="true">
            {Array.from({ length: lessons.length || 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Shimmer className="h-8 w-8 shrink-0 rounded-full" delay={i * 0.1} />
                <div className="flex-1 space-y-2 pt-1"><Shimmer className="h-3 w-4/5" delay={i * 0.1} /><Shimmer className="h-2.5 w-1/2" delay={i * 0.1} /></div>
              </div>
            ))}
          </div>
        ) : (
          <ol className="relative">
            <span className="absolute bottom-6 left-[23.5px] top-6 w-px bg-white/[0.07]" aria-hidden="true" />
            {lessons.map((lesson, i) => (
              <SyllabusLessonRow
                key={lesson.id}
                lesson={lesson}
                index={i}
                status={lessonStatuses[i]}
                isActive={activeSection === "video" && activeLesson === i}
                progress={lessonProgresses[i] ?? 0}
                onSelect={() => onSelectLesson(i)}
              />
            ))}
          </ol>
        )}

        <p className={cx(EYEBROW, "mb-2 mt-6 px-2")}>Assessment</p>
        <div className="space-y-1">
          <button
            disabled={!allLessonsReady}
            onClick={() => allLessonsReady && onSelectQuiz()}
            className={cx(
              "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors",
              activeSection === "quiz" ? "bg-[#8B7CFF]/[0.1]" : !allLessonsReady ? "cursor-not-allowed opacity-40" : "hover:bg-white/[0.04]"
            )}
          >
            <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1", quizDone ? "bg-[#3DDC97]/10 ring-[#3DDC97]/30" : "bg-white/[0.03] ring-white/[0.1]")}>
              <ClipboardList className={cx("h-3.5 w-3.5", quizDone ? "text-[#3DDC97]" : "text-[#B9BCCB]")} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-white">Final quiz</span>
              <span className="block text-[11px] text-[#6E7389]">
                {quizCount > 0 ? `${quizCount} question${quizCount === 1 ? "" : "s"}` : "Questions coming"}
              </span>
            </span>
            {!allLessonsReady && <Lock className="h-3 w-3 text-[#555A6E]" />}
          </button>
          <button
            disabled={!quizDone}
            onClick={() => quizDone && onSelectResults()}
            className={cx(
              "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors",
              activeSection === "results" ? "bg-[#8B7CFF]/[0.1]" : !quizDone ? "cursor-not-allowed opacity-40" : "hover:bg-white/[0.04]"
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.03] ring-1 ring-white/[0.1]">
              <Trophy className={cx("h-3.5 w-3.5", quizDone ? "text-[#FFB547]" : "text-[#B9BCCB]")} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-white">Results</span>
              <span className="block text-[11px] text-[#6E7389]">{quizScore !== null ? `Readiness ${quizScore}%` : "Readiness score"}</span>
            </span>
            {!quizDone && <Lock className="h-3 w-3 text-[#555A6E]" />}
          </button>
        </div>

        {pathAfter.map((entry) => courseBlock(entry, "next"))}
      </nav>
    </aside>
  );

  if (!isMobile) {
    return (
      <div className={cx("h-full shrink-0 overflow-hidden transition-[width] duration-300", open ? "w-[320px]" : "w-0")}>
        {body}
      </div>
    );
  }
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={onClose} />}
      <div className={cx("fixed inset-y-0 right-0 z-40 transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")}>{body}</div>
    </>
  );
}

function MobileBar({ onMenu, title }: { onMenu: () => void; title?: string }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0A0B10]/80 px-3 backdrop-blur-xl">
      <button onClick={onMenu} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#B9BCCB] hover:bg-white/[0.06]" aria-label="Open library">
        <Menu className="h-5 w-5" />
      </button>
      <Logo size={26} />
      <span className="lu-serif truncate text-lg text-white">{title ?? "Level Up"}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AILearningPage() {
  const router = useNavigate();
  // Read before `phase` so a direct load of /ai_tutor/:courseId never flashes the composer.
  const { courseId: urlCourseId } = useParams<{ courseId?: string }>();
  const [phase, setPhase] = useState<AppPhase>(() => (urlCourseId ? "course" : "upload"));
  const [fileName, setFileName] = useState("");
  const [pendingGeneration, setPendingGeneration] = useState<{ name: string; file?: File | null; tier?: string | null } | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>(MOCK_LESSONS);
  const [lessonStatuses, setLessonStatuses] = useState<LessonStatus[]>(MOCK_LESSONS.map(() => "generating"));
  const [activeSection, setActiveSection] = useState<CourseSection>("video");
  const [activeLesson, setActiveLesson] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<MCQQuestion[]>(MOCK_QUESTIONS);
  const [quizDone, setQuizDone] = useState(false);
  const [serverQuizResult, setServerQuizResult] = useState<QuizResult | null>(null);
  const [courseSidebarOpen, setCourseSidebarOpen] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  // Distinguishes "fetching a finished course to this browser" from "server still generating".
  const [courseDetailsLoading, setCourseDetailsLoading] = useState(() => !!urlCourseId);

  // course_completed fires once, only for courses generated this session.
  const startedCoursesRef = useRef<Set<string>>(new Set());
  const completedFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ready = lessonStatuses.length > 0 && lessonStatuses.every((s) => s === "ready" || s === "failed");
    if (ready && activeHistoryId && startedCoursesRef.current.has(activeHistoryId) && !completedFiredRef.current.has(activeHistoryId)) {
      completedFiredRef.current.add(activeHistoryId);
      analytics.courseCompleted({ courseId: activeHistoryId });
    }
  }, [lessonStatuses, activeHistoryId]);

  const [activeCourseIsFreeTrial, setActiveCourseIsFreeTrial] = useState(false);
  const [activeCourseQuizMinutes, setActiveCourseQuizMinutes] = useState(30);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [retryingLesson, setRetryingLesson] = useState<number | null>(null);
  const [retryingLabel, setRetryingLabel] = useState("Regenerating…");
  const [unlockingCourse, setUnlockingCourse] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  // Inline follow-up generation (results page → next course, in place).
  const [startingFollowUp, setStartingFollowUp] = useState(false);
  const startingFollowUpRef = useRef(false);
  const [startingFollowUpLabel, setStartingFollowUpLabel] = useState("");

  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const [failureBanner, setFailureBanner] = useState<{ lessonIndex: number; title: string; error: string | null } | null>(null);
  const seenFailuresRef = useRef<Set<number>>(new Set());

  const storedUser = localStorage.getItem("user");
  const user: SessionUser = storedUser ? JSON.parse(storedUser) : null;

  const handleLogout = () => {
    analytics.loggedOut();
    resetUser();
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    router("/login");
  };

  const bgTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollCancelRef = useRef<(() => void) | null>(null);
  // Mirrors activeHistoryId for async callbacks that must check it at resolution time.
  const activeHistoryIdRef = useRef<string | null>(null);
  useEffect(() => { activeHistoryIdRef.current = activeHistoryId; }, [activeHistoryId]);
  // Same reason: detachActiveCoursePoll runs inside event handlers and needs
  // the CURRENT statuses to decide whether the course it is leaving still has
  // work in flight worth watching in the background.
  const lessonStatusesRef = useRef<LessonStatus[]>([]);
  useEffect(() => { lessonStatusesRef.current = lessonStatuses; }, [lessonStatuses]);
  const lessonProgresses = useLessonProgress(lessonStatuses, lessons.map((l) => l.sceneProgress));
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) {
      setHistorySidebarCollapsed(true);
      setCourseSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => { if (!user) router("/login"); }, []);

  const fetchCredits = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/payment/credits`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCredits(await res.json());
    } catch (err) { console.error("Failed to fetch credits:", err); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      fetchCredits();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => { fetchCredits(); }, []);

  const [courseTiers, setCourseTiers] = useState<CourseTier[] | null>(null);
  useEffect(() => {
    getPricingConfig()
      .then((cfg) => setCourseTiers(cfg.courseTiers))
      .catch((err) => console.error("Failed to fetch pricing config:", err));
  }, []);

  useEffect(() => { return () => { if (pollCancelRef.current) pollCancelRef.current(); }; }, []);

  // Applies a polled course snapshot to the currently displayed course.
  const applyCourseUpdate = (course: CourseFromAPI) => {
    setLessons((prev) => prev.map((l, i) => mergeLesson(l, course.lessons[i])));
    if (course.lessons.length > 0) setLessonStatuses(course.lessons.map((l) => mapStatus(l?.status)));
    if (course.questions?.length) setQuizQuestions(course.questions);
    // The course-level status drives the quiz section's "still being written"
    // vs "it failed" split, so it has to track the poll, not just the lessons.
    setHistory((prev) => prev.map((e) => (e.id === course._id ? { ...e, status: course.status } : e)));
  };

  // Keeps a course's SIDEBAR ENTRY up to date after the user has moved off it.
  // pollCancelRef holds a single poll — the one driving the open course — so
  // opening or generating something else cancels it. For a course that was
  // still generating that left its entry frozen on "Generating" forever (until
  // a reload), even though the server went on to finish it. These background
  // watchers update only the history entry, never the live view, so they can
  // run alongside whatever course is currently open.
  const bgPollsRef = useRef<Map<string, () => void>>(new Map());

  const watchCourseInBackground = (courseId: string) => {
    if (!courseId || bgPollsRef.current.has(courseId)) return;
    const cancel = pollCourse(courseId, (course: CourseFromAPI) => {
      const statuses = course.lessons.map((l) => mapStatus(l.status));
      setHistory((prev) => prev.map((e) => e.id !== course._id ? e : {
        ...e,
        lessons: e.lessons.map((l, i) => mergeLesson(l, course.lessons[i])),
        // Keep the placeholders until the server has actually written its
        // lessons: processCourse fills the whole array in one update after the
        // course-plan call, so `[]` here means "still planning", not "no
        // lessons" — and overwriting with [] made the rail drop its
        // "Generating" line for the first half-minute of every new course.
        lessonStatuses: statuses.length ? statuses : e.lessonStatuses,
        questions: course.questions?.length ? course.questions : e.questions,
        status: course.status,
      }));
      // Done — stop holding the handle so a later revisit can watch it again.
      // Keyed off the course's own status, not "are any lessons generating":
      // a brand-new course's lessons array is still empty on the first poll,
      // which the old check read as finished and cancelled itself over.
      if (course.status === "ready" || course.status === "failed") {
        bgPollsRef.current.get(course._id)?.();
        bgPollsRef.current.delete(course._id);
      }
    });
    bgPollsRef.current.set(courseId, cancel);
  };

  // Hand the currently-open course off to a background watcher if it is still
  // generating, right before its foreground poll gets cancelled.
  const detachActiveCoursePoll = () => {
    const leaving = activeHistoryIdRef.current;
    if (leaving && lessonStatusesRef.current.some((s) => s === "generating")) {
      watchCourseInBackground(leaving);
    }
    if (pollCancelRef.current) pollCancelRef.current();
  };

  useEffect(() => () => {
    bgPollsRef.current.forEach((cancel) => cancel());
    bgPollsRef.current.clear();
  }, []);

  const mapCourseToEntry = (c: CourseFromAPI): HistoryEntry => {
    const mappedLessons: Lesson[] = (c.lessons || []).map((l, i) => ({
      id: i + 1, title: l.title || `Lesson ${i + 1}`, completed: false,
      description: l.description || "", keyPoints: l.keyPoints?.length ? l.keyPoints : ["", "", "", ""],
      videoUrl: l.videoUrl, code: l.code ?? null, totalFrames: l.totalFrames ?? null, error: l.error ?? null,
      sceneProgress: l.sceneProgress ?? [], scenes: l.scenes ?? [],
    }));
    const mappedStatuses: LessonStatus[] = (c.lessons || []).map((l) => mapStatus(l.status));
    return {
      id: c._id, fileName: c.topic,
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      completedLessons: 0, quizScore: null,
      lessons: mappedLessons.length ? mappedLessons : MOCK_LESSONS,
      lessonStatuses: mappedStatuses.length ? mappedStatuses : MOCK_LESSONS.map(() => "generating" as LessonStatus),
      quizAnswers: [], quizDone: false, questions: c.questions || [],
      isFreeTrialCourse: !!c.isFreeTrialCourse,
      timeAllocationMinutes: c.timeAllocationMinutes ?? 30,
      parentCourseId: c.parentCourseId ?? null,
      followUpKind: c.followUpKind ?? null,
      creditCost: c.creditCost,
      status: c.status,
      mcqCount: c.mcqCount,
    };
  };

  // Restores server-side watched/quiz state onto a freshly mapped entry.
  const enrichEntryWithProgress = async (entry: HistoryEntry): Promise<HistoryEntry> => {
    const [progress, attempt] = await Promise.all([
      getProgress(entry.id).catch(() => null),
      getLatestAttempt(entry.id).catch(() => null),
    ]);
    if (!progress?.lessons.length && !attempt) return entry;
    const lessons = progress?.lessons.length
      ? entry.lessons.map((l) => ({ ...l, completed: !!progress!.lessons.find((p) => p.lessonNumber === l.id)?.watched }))
      : entry.lessons;
    return attempt
      ? { ...entry, lessons, quizDone: true, quizScore: attempt.pct, serverQuizResult: attempt }
      : { ...entry, lessons };
  };

  const loadMoreHistory = async () => {
    if (loadingMoreHistory || !historyHasMore) return;
    setLoadingMoreHistory(true);
    try {
      const nextPage = historyPage + 1;
      const { courses, hasMore } = await listCourses(nextPage, HISTORY_PAGE_SIZE);
      setHistory((prev) => [...prev, ...courses.map(mapCourseToEntry)]);
      setHistoryPage(nextPage);
      setHistoryHasMore(hasMore);
    } catch (err) {
      console.error("Failed to load more courses:", err);
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { courses, hasMore } = await listCourses(1, HISTORY_PAGE_SIZE);
        if (cancelled) return;
        setHistoryHasMore(hasMore);
        setHistoryPage(1);
        if (courses.length === 0) { setHistoryLoading(false); return; }
        const entries: HistoryEntry[] = courses.map(mapCourseToEntry);
        if (!cancelled) { setHistory(entries); setHistoryLoading(false); }

        entries.forEach((entry) => {
          enrichEntryWithProgress(entry).then((enriched) => {
            if (cancelled || enriched === entry) return;
            setHistory((prev) => prev.map((e) => (e.id === entry.id ? enriched : e)));
          });
        });

        const stillGenerating = courses.find((c) => c.status === "generating");
        if (stillGenerating && !cancelled) {
          pollCancelRef.current = pollCourse(stillGenerating._id, (course: CourseFromAPI) => {
            setHistory((prev) => prev.map((e) => e.id !== course._id ? e : {
              ...e,
              lessons: e.lessons.map((l, i) => mergeLesson(l, course.lessons[i])),
              lessonStatuses: course.lessons.map((l) => mapStatus(l.status)),
              questions: course.questions?.length ? course.questions : e.questions,
            }));
          });
        }
      } catch (err) { console.error("Failed to load saved courses:", err); setHistoryLoading(false); setHistoryError(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const markComplete = (lessonId: number) => {
    setLessons((prev) => prev.map((l) => l.id === lessonId ? { ...l, completed: true } : l));
  };

  useEffect(() => {
    lessonStatuses.forEach((status, i) => {
      if (status === "failed" && !seenFailuresRef.current.has(i)) {
        seenFailuresRef.current.add(i);
        setFailureBanner({ lessonIndex: i, title: lessons[i]?.title || `Lesson ${i + 1}`, error: lessons[i]?.error ?? null });
      }
      if (status !== "failed" && seenFailuresRef.current.has(i)) {
        seenFailuresRef.current.delete(i);
      }
    });
  }, [lessonStatuses, lessons]);

  // Full-lesson regenerate. Errors propagate to the caller (no double alerts).
  const handleFullRetryLesson = async (lessonIndex: number) => {
    setRetryingLabel("Regenerating…");
    await retryLesson(activeHistoryId!, lessonIndex);
    setLessonStatuses((prev) => prev.map((s, i) => i === lessonIndex ? "generating" : s));
    setLessons((prev) => prev.map((l, i) => i === lessonIndex ? { ...l, code: null, totalFrames: null } : l));
    if (pollCancelRef.current) pollCancelRef.current();
    pollCancelRef.current = pollCourse(activeHistoryId!, applyCourseUpdate);
  };

  // With crashInfo: try the targeted scene patch first, then fall back to a
  // full regenerate. The fallback is UNCONDITIONAL on purpose — this used to
  // only fall back when the backend set fallbackToFullRetry (i.e. it couldn't
  // isolate which scene broke) and re-threw everything else, which turned an
  // ordinary "the patch didn't come together" into a dead end: the user got
  // "Failed to regenerate lesson. Please try again." and nothing happened,
  // where previously they'd at least have gotten a (slower) working lesson.
  // Clicking the button must always end in either a fixed lesson or a
  // regenerating one — never a bare error with no work started. The alert
  // below now only fires if the full regenerate ALSO fails, which means the
  // request itself didn't land (offline, auth, server down).
  const handleRetryLesson = async (lessonIndex: number, crashInfo?: LessonCrashInfo) => {
    if (!activeHistoryId || retryingLesson !== null) return;
    analytics.lessonRegenerated({ lesson: lessonIndex + 1 });
    setRetryingLesson(lessonIndex);
    try {
      if (crashInfo) {
        setRetryingLabel("Fixing the part that broke…");
        try {
          const result = await retryScene(activeHistoryId, lessonIndex, crashInfo);
          setLessons((prev) => prev.map((l, i) => i === lessonIndex ? { ...l, code: result.code } : l));
          return;
        } catch (err) {
          // Either way we continue to the full regenerate below; the only
          // difference is what we log, so a genuinely-unexpected failure is
          // still distinguishable from the expected "couldn't isolate it".
          if (err instanceof RetrySceneError && err.fallbackToFullRetry) {
            console.warn("Backend couldn't isolate the broken scene — falling back to a full lesson regenerate:", err.message);
          } else {
            console.warn("Targeted scene fix failed — falling back to a full lesson regenerate:", err);
          }
          setRetryingLabel("Rebuilding this lesson…");
        }
      }
      await handleFullRetryLesson(lessonIndex);
    } catch (err) {
      console.error("Failed to retry lesson:", err);
      alert("Couldn't start fixing this lesson — check your connection and try again.");
    } finally {
      setRetryingLesson(null);
    }
  };

  const handleUnlockCourse = async () => {
    if (!activeHistoryId || unlockingCourse) return;
    setUnlockingCourse(true);
    try {
      await unlockCourse(activeHistoryId);
      fetchCredits();
      setLessonStatuses((prev) => prev.map((s) => s === "locked" ? "generating" : s));
      if (pollCancelRef.current) pollCancelRef.current();
      try {
        const course = await getCourseStatus(activeHistoryId);
        applyCourseUpdate(course);
      } catch (statusErr) {
        console.error("Failed to fetch course status right after unlock:", statusErr);
      }
      pollCancelRef.current = pollCourse(activeHistoryId, applyCourseUpdate);
    } catch (err: any) {
      console.error("Failed to unlock course:", err);
      alert(err?.message || "Couldn't unlock this course. Make sure you have a course credit, then try again.");
    } finally {
      setUnlockingCourse(false);
    }
  };

  // Mirrors the live course state into its own sidebar entry. activeHistoryId
  // is in the dependency list deliberately: it is READ here, so leaving it out
  // meant the effect always ran against whichever course happened to be active
  // when lessons/lessonStatuses last changed — the exact stale-pairing that let
  // one course's state be written onto another's entry.
  useEffect(() => {
    if (!activeHistoryId) return;
    setHistory((prev) => prev.map((e) => e.id !== activeHistoryId ? e : {
      ...e, lessons, lessonStatuses, completedLessons: lessons.filter((l) => l.completed).length,
      quizAnswers, quizDone, questions: quizQuestions,
      quizScore: quizDone ? Math.round((quizAnswers.filter((a) => { const q = quizQuestions.find((q) => q.id === a.questionId); return q && q.correct === a.selected; }).length / Math.max(quizQuestions.length, 1)) * 100) : null,
    }));
  }, [activeHistoryId, lessons, lessonStatuses, quizAnswers, quizDone, quizQuestions]);

  const handleDeleteCourse = async (id: string) => {
    setHistory((prev) => prev.filter((e) => e.id !== id));
    if (activeHistoryId === id) { if (pollCancelRef.current) pollCancelRef.current(); setActiveHistoryId(null); setPhase("upload"); router("/ai_tutor", { replace: true }); }
    try { await deleteCourse(id); } catch (err) { console.error("Failed to delete course:", err); }
  };

  // Submit from the composer → optional level check → runGeneration.
  const startNewCourse = async (name: string, file?: File | null, tier?: string | null) => {
    setPendingGeneration({ name, file, tier });
    setFileName(name);
    setPhase("assessment");
  };

  const runGeneration = async (name: string, file: File | null | undefined, level: Level, tier: string | null) => {
    analytics.courseStarted({ topic: name, source: file ? (file.name.toLowerCase().endsWith(".pptx") ? "pptx" : "pdf") : "topic" });
    bgTimersRef.current.forEach(clearTimeout); bgTimersRef.current = [];
    detachActiveCoursePoll();
    // Detach from the previously-open course BEFORE the placeholder lessons
    // below replace the live state. The effect that mirrors live state into the
    // sidebar keys off activeHistoryId, and the new course's id does not exist
    // until startCourseGeneration resolves — so without this, the new course's
    // all-"generating" placeholders were written into the PREVIOUS course's
    // history entry, which then showed "Generating" forever because polling for
    // it was just cancelled on the line above. Null means "no course owns the
    // live state right now", and that effect no-ops until the new id arrives.
    setActiveHistoryId(null);
    setFileName(name); setPhase("course");
    // Untouched 100-credit bonus = first course ever (drives the post-quiz feedback prompt).
    const isFirstCourseEver = credits?.signupBonusCredits === 100;
    setActiveCourseIsFreeTrial(isFirstCourseEver);
    const selectedTier = tier ? courseTiers?.find((t) => t.key === tier) : null;
    const lessonCount = !selectedTier ? 6 : selectedTier.lessonCount;
    setActiveCourseQuizMinutes(!selectedTier ? 30 : selectedTier.timeAllocationMinutes);
    setLessons(buildMockLessons(lessonCount).map((l) => ({ ...l, completed: false, videoUrl: null, code: null, totalFrames: null })));
    setLessonStatuses(buildMockLessons(lessonCount).map(() => "generating"));
    setActiveSection("video"); setActiveLesson(0);
    try {
      const { courseId } = await startCourseGeneration(name, file, level, tier);
      startedCoursesRef.current.add(courseId);
      fetchCredits();
      const freshLessons = buildMockLessons(lessonCount).map((l) => ({ ...l, completed: false, videoUrl: null, code: null, totalFrames: null }));
      const freshStatuses: LessonStatus[] = freshLessons.map(() => "generating");
      setHistory((prev) => [{ id: courseId, fileName: name, createdAt: new Date(), completedLessons: 0, quizScore: null, lessons: freshLessons, lessonStatuses: freshStatuses, quizAnswers: [], quizDone: false, questions: [] }, ...prev]);
      setActiveHistoryId(courseId); router(`/ai_tutor/${courseId}`, { replace: true });
      setLessons(freshLessons); setLessonStatuses(freshStatuses);
      setQuizQuestions([]); setActiveSection("video"); setActiveLesson(0); setQuizAnswers([]); setQuizDone(false);
      seenFailuresRef.current.clear(); setFailureBanner(null);
      pollCancelRef.current = pollCourse(courseId, applyCourseUpdate);
    } catch (err: any) {
      console.error(err);
      setPhase("upload");
      if (err?.status === 402) setShowPaywall(true);
      else alert(err?.message || "Failed to generate course. Please try again.");
    }
  };

  // Results → next course. The new course becomes the open one, so the page
  // lands on its build-in-progress stage with the path breadcrumb showing it
  // as the newest step. Staying on the parent's results instead left the
  // thing the user just paid for below the fold.
  //
  // Still not runGeneration: that path resets the stage from scratch and runs
  // the level-assessment chat. Here the quiz we just graded IS the level
  // signal, so generation starts immediately. Credits are spent server-side
  // by checkCredits on this request; nothing here deducts anything locally.
  const startFollowUpCourse = async (
    topic: string, tierKey: string, level: Level, kind: "repair" | "extend"
  ) => {
    // Guarded by a ref, not the `starting` state: setState is async, so two
    // clicks in the same tick would both pass a state check and spend credits
    // twice. The overlay below blocks the pointer; this blocks the logic.
    if (startingFollowUpRef.current) return;
    const parentId = activeHistoryIdRef.current;
    if (!parentId) return;
    startingFollowUpRef.current = true;
    const tier = courseTiers?.find((t) => t.key === tierKey) ?? null;
    const lessonCount = tier?.lessonCount ?? 6;
    setFollowUpError(null);
    setStartingFollowUpLabel(
      tier ? `“${topic}” · ${tier.creditCost} credits` : `“${topic}”`
    );
    setStartingFollowUp(true);
    analytics.courseStarted({ topic, source: "topic" });
    try {
      const { courseId } = await startCourseGeneration(topic, null, level, tierKey, {
        parentCourseId: parentId,
        followUpKind: kind,
      });
      startedCoursesRef.current.add(courseId);
      fetchCredits();
      const placeholder = buildMockLessons(lessonCount).map((l) => ({
        ...l, completed: false, videoUrl: null, code: null, totalFrames: null,
      }));
      const newCourse: HistoryEntry = {
        id: courseId, fileName: topic, createdAt: new Date(),
        completedLessons: 0, quizScore: null,
        lessons: placeholder, lessonStatuses: placeholder.map(() => "generating" as LessonStatus),
        quizAnswers: [], quizDone: false, questions: [],
        parentCourseId: parentId, followUpKind: kind,
        creditCost: tier?.creditCost,
        status: "generating", mcqCount: tier?.mcqCount,
        timeAllocationMinutes: tier?.timeAllocationMinutes ?? 30,
      };
      setHistory((prev) => [newCourse, ...prev]);
      // Open it. restoreEntry hands the course we're leaving to a background
      // watcher, points the URL at the new one, and — because its status is
      // "generating" — starts the foreground poll that drives the build
      // progress on screen. No background watcher needed here as well.
      restoreEntry(newCourse);
    } catch (err) {
      console.error(err);
      // startCourseGeneration attaches the HTTP status so a 402 (out of
      // credits) can open the paywall instead of showing a generic error.
      const failure = err as { status?: number; message?: string };
      if (failure?.status === 402) setShowPaywall(true);
      else setFollowUpError(failure?.message || "Couldn't start that course. Please try again.");
    } finally {
      startingFollowUpRef.current = false;
      setStartingFollowUp(false);
    }
  };

  const handleAssessmentDone = (level: Level) => {
    if (!pendingGeneration) { setPhase("upload"); return; }
    const { name, file, tier } = pendingGeneration;
    setPendingGeneration(null);
    runGeneration(name, file, level, tier ?? null);
  };

  const restoreEntry = (entry: HistoryEntry) => {
    detachActiveCoursePoll();
    // This course may already be watched in the background (e.g. a follow-up
    // generating in the panel below its parent). The foreground poll below
    // takes over, so release that handle rather than polling it twice.
    bgPollsRef.current.get(entry.id)?.();
    bgPollsRef.current.delete(entry.id);
    setCourseDetailsLoading(false);
    setActiveHistoryId(entry.id);
    if (urlCourseId !== entry.id) router(`/ai_tutor/${entry.id}`);
    setFileName(entry.fileName); setLessons(entry.lessons);
    setActiveCourseIsFreeTrial(!!entry.isFreeTrialCourse);
    setActiveCourseQuizMinutes(entry.timeAllocationMinutes ?? 30);
    setLessonStatuses(entry.lessonStatuses ?? entry.lessons.map(() => "ready"));
    setQuizAnswers(entry.quizAnswers); setQuizDone(entry.quizDone); setQuizQuestions(entry.questions ?? []);
    setServerQuizResult(entry.serverQuizResult ?? null);
    // Always the videos, even for a course whose quiz is long done: opening a
    // course from the library means "show me what's in it", and landing on a
    // score hides every lesson behind a back-click. Results stay one click
    // away in the syllabus, for whoever actually wants them.
    setActiveSection("video"); setActiveLesson(0); setPhase("course");
    // "Every lesson is ready" is NOT "the course is finished": the quiz is
    // written after the last lesson, so a course can sit in `generating` with
    // nothing left to show in the lesson list. Polling only on lesson state
    // meant the quiz never arrived without a reload.
    if (entry.status === "generating" || entry.lessonStatuses?.some((s) => s === "generating")) {
      pollCancelRef.current = pollCourse(entry.id, applyCourseUpdate);
    } else if (entry.lessons.some((l) => l.code == null)) {
      // The list endpoint omits heavy lesson code — fetch it once, on open.
      setCourseDetailsLoading(true);
      getCourseStatus(entry.id)
        .then((course) => {
          const fillCode = (prevLessons: Lesson[]) =>
            prevLessons.map((l, i) => {
              const a = course.lessons[i];
              if (!a) return l;
              return { ...l, videoUrl: a.videoUrl ?? l.videoUrl, code: a.code ?? l.code, totalFrames: a.totalFrames ?? l.totalFrames, sceneProgress: a.sceneProgress ?? l.sceneProgress };
            });
          setHistory((prev) => prev.map((e) => (e.id === entry.id ? { ...e, lessons: fillCode(e.lessons) } : e)));
          // Only touch the displayed course if the user is still on it.
          if (activeHistoryIdRef.current === entry.id) { setLessons(fillCode); setCourseDetailsLoading(false); }
        })
        .catch((err) => {
          console.error(`Failed to load full lesson code for course ${entry.id}:`, err);
          if (activeHistoryIdRef.current === entry.id) setCourseDetailsLoading(false);
        });
    }
  };

  // URL is a source of truth: fresh load, back/forward, or pasted link.
  useEffect(() => {
    if (!urlCourseId) return;
    if (urlCourseId === activeHistoryIdRef.current) return;
    setCourseDetailsLoading(true);
    getCourseStatus(urlCourseId)
      .then((course) => enrichEntryWithProgress(mapCourseToEntry(course)))
      .then((entry) => restoreEntry(entry))
      .catch((err) => {
        console.error(`Failed to load course ${urlCourseId} from URL:`, err);
        setCourseDetailsLoading(false);
        setPhase("upload");
        router("/ai_tutor", { replace: true });
      });
  }, [urlCourseId]);

  const allLessonsReady = lessonStatuses.every((s) => s === "ready" || s === "failed");

  // ── Derived view state ──
  const currentLesson = lessons[activeLesson] ?? lessons[0];
  const completedCount = lessons.filter((l) => l.completed).length;
  const courseProgress = lessons.length ? (completedCount / lessons.length) * 100 : 0;
  const generatingCount = lessonStatuses.filter((s) => s === "generating").length;
  const activeEntry = history.find((e) => e.id === activeHistoryId);
  // EVERYTHING generated under the open course — children, grandchildren, the
  // whole thread — in depth-first reading order, so one view and one syllabus
  // cover the entire branch rather than stopping at the first generation.
  // Memoised because the auto-show effect below keys off it; a fresh array
  // every render would re-run that effect constantly.
  const followUpChildren = useMemo(() => {
    if (!activeHistoryId) return [];
    const out: HistoryEntry[] = [];
    const visited = new Set<string>([activeHistoryId]);
    const walk = (parentId: string) => {
      const kids = history
        .filter((e) => e.parentCourseId === parentId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (const kid of kids) {
        if (visited.has(kid.id)) continue; // cycle guard
        visited.add(kid.id);
        out.push(kid);
        walk(kid.id);
      }
    };
    walk(activeHistoryId);
    return out;
  }, [history, activeHistoryId]);

  // The chain of courses that led here, root first and the open course last —
  // what the results page charts as a learning path. `seen` guards against a
  // cycle: parentCourseId is validated server-side but this walk must
  // terminate regardless of what the API hands back.
  const lineageChain: HistoryEntry[] = useMemo(() => {
    const out: HistoryEntry[] = [];
    const seen = new Set<string>();
    let cursor = history.find((e) => e.id === activeHistoryId);
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      out.unshift(cursor);
      const parentId: string | null | undefined = cursor.parentCourseId;
      cursor = parentId ? history.find((e) => e.id === parentId) : undefined;
    }
    return out;
  }, [history, activeHistoryId]);

  // The sidebar only holds the first page of courses, so a parent or child
  // outside it used to be invisible until a reload happened to pull it in —
  // which is why the previous course wouldn't appear above a follow-up. Ask
  // the server for both directions whenever the open course changes.
  useEffect(() => {
    if (!activeHistoryId) return;
    let alive = true;
    getCourseLineage(activeHistoryId)
      .then(({ ancestors, descendants }) => {
        if (!alive) return;
        const incoming = [...ancestors, ...descendants];
        if (incoming.length === 0) return;
        setHistory((prev) => {
          const known = new Set(prev.map((e) => e.id));
          // Existing entries win: they may already hold polled lesson code
          // and live sceneProgress that this lighter payload lacks. Only the
          // lineage fields are refreshed on them.
          const merged = prev.map((e) => {
            const fresh = incoming.find((c) => c._id === e.id);
            return fresh
              ? { ...e, parentCourseId: fresh.parentCourseId ?? null, followUpKind: fresh.followUpKind ?? null }
              : e;
          });
          const added = incoming.filter((c) => !known.has(c._id)).map(mapCourseToEntry);
          return [...merged, ...added].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        });
        // A follow-up still building from an earlier session gets picked up
        // here, so its card and the rail report live progress.
        descendants
          .filter((c) => c.status === "generating")
          .forEach((c) => watchCourseInBackground(c._id));
      })
      .catch((err) => console.error("Failed to load course lineage:", err));
    return () => { alive = false; };
  }, [activeHistoryId]);

  // Courses the open one continues from, oldest first — rendered above the
  // stage. The open course itself is the last link of the chain.
  const pathBefore = lineageChain.slice(0, -1);

  // The whole thread in reading order, the open course included — what the
  // breadcrumb walks. Built from the two halves that already exist, so it
  // stays correct however the user got here.
  const pathSteps: HistoryEntry[] = activeEntry
    ? [...pathBefore, activeEntry, ...followUpChildren]
    : [];

  // Picking any lesson of any course in the path OPENS that course on that
  // lesson. It used to play inline in a card stacked above or below the stage,
  // which meant the column held several courses at once and the page changed
  // shape depending on which one you came from. One course on screen at a
  // time, chosen from the syllabus, is simpler to hold in your head — and
  // restoreEntry already fetches the lesson code it needs.
  const selectPathLesson = (courseId: string, lesson: number) => {
    const entry = history.find((e) => e.id === courseId);
    if (!entry) return;
    restoreEntry(entry);
    setActiveSection("video");
    setActiveLesson(lesson);
  };

  const handleNew = () => {
    if (isMobile) setHistorySidebarCollapsed(true);
    if (phase === "upload") return;
    setPendingGeneration(null);
    setPhase("upload");
    router("/ai_tutor");
  };

  const library = (
    <LibraryRail
      history={history}
      activeId={activeHistoryId}
      onSelect={(e) => { restoreEntry(e); if (isMobile) setHistorySidebarCollapsed(true); }}
      onNew={handleNew}
      onDelete={handleDeleteCourse}
      collapsed={historySidebarCollapsed}
      onToggle={() => setHistorySidebarCollapsed((c) => !c)}
      loading={historyLoading}
      error={historyError}
      credits={credits}
      onBuy={() => setShowPaywall(true)}
      isMobile={isMobile}
      onFeedback={() => setShowFeedback(true)}
      hasMore={historyHasMore}
      loadingMore={loadingMoreHistory}
      onLoadMore={loadMoreHistory}
      user={user}
      onLogout={handleLogout}
    />
  );

  const modals = (
    <>
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} courseId={activeHistoryId} courseName={fileName || undefined} onSuccess={(awarded) => { if (awarded > 0) fetchCredits(); }} />}
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
      {startingFollowUp && <StartingOverlay label={startingFollowUpLabel} />}
      {phase === "course" && showShareModal && activeHistoryId && <ShareModal courseId={activeHistoryId} onClose={() => setShowShareModal(false)} />}
      {phase === "course" && showPublishModal && activeHistoryId && <PublishModal courseId={activeHistoryId} onClose={() => setShowPublishModal(false)} />}
    </>
  );

  const lessonControls = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button disabled={activeLesson === 0} onClick={() => setActiveLesson((i) => i - 1)} className={BTN_SOFT}>
        <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
      </button>
      <div className="flex items-center gap-2">
        {activeLesson < lessons.length - 1 ? (
          lessonStatuses[activeLesson + 1] === "locked" ? (
            <button
              disabled={unlockingCourse}
              onClick={handleUnlockCourse}
              className={cx(BTN_BASE, "bg-[#FFB547] font-semibold text-[#2A1A00] hover:brightness-110")}
            >
              {unlockingCourse
                ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="hidden sm:inline">Unlocking…</span></>
                : <><Lock className="h-4 w-4" /><span className="hidden sm:inline">Unlock (1 credit)</span><span className="sm:hidden">Unlock</span></>}
            </button>
          ) : lessonStatuses[activeLesson + 1] === "generating" ? (
            <button disabled className={BTN_SOFT}>
              <Loader2 className="h-4 w-4 animate-spin" /><span className="hidden sm:inline">Next lesson generating…</span>
            </button>
          ) : (
            <button onClick={() => setActiveLesson((i) => i + 1)} className={BTN_PRIMARY}>
              <span className="hidden sm:inline">Next lesson</span><span className="sm:hidden">Next</span><ChevronRight className="h-4 w-4" />
            </button>
          )
        ) : (
          <button disabled={!allLessonsReady} onClick={() => setActiveSection("quiz")} className={BTN_PRIMARY}>
            <ClipboardList className="h-4 w-4" /><span className="hidden sm:inline">Take the</span> quiz
          </button>
        )}
      </div>
    </div>
  );

  const handleQuizSubmit = (answers: QuizAnswer[]) => {
    setQuizAnswers(answers); setQuizDone(true); setActiveSection("results");
    // Score recomputed + persisted server-side; client answers never trusted for the score.
    setServerQuizResult(null);
    if (activeHistoryId) {
      submitQuizApi(activeHistoryId, answers)
        .then(setServerQuizResult)
        .catch((err) => console.error("Failed to persist quiz result:", err));
    }
    if (activeCourseIsFreeTrial) {
      setTimeout(() => setShowFeedback(true), 3000);
    }
  };

  return (
    <div
      className="flex h-screen overflow-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <StudioStyles />
      {modals}
      {library}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* ── Composer ── */}
        {phase === "upload" && (
          <>
            {isMobile && <MobileBar onMenu={() => setHistorySidebarCollapsed(false)} />}
            <div className="lu-scroll flex-1 overflow-y-auto">
              <Composer onGenerate={startNewCourse} credits={credits} courseTiers={courseTiers} onRequestTopUp={() => setShowPaywall(true)} />
            </div>
          </>
        )}

        {/* ── Level check ── */}
        {phase === "assessment" && (
          <>
            {isMobile && <MobileBar onMenu={() => setHistorySidebarCollapsed(false)} />}
            <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-6">
              <Aurora />
              <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
                <div className="lu-rise mb-5 px-1">
                  <p className={EYEBROW}>Quick level check</p>
                  <h2 className="lu-serif mt-2 truncate text-3xl text-white sm:text-4xl">
                    Calibrating <span className="italic text-[#C3BAFF]">{cleanName(pendingGeneration?.name || fileName)}</span>
                  </h2>
                  <p className="mt-1 text-sm text-[#8A8FA3]">A few quick questions so lessons land at the right depth. Skip anytime.</p>
                </div>
                <div className="lu-rise flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white text-slate-900 shadow-[0_40px_100px_-40px_rgba(0,0,0,1)] ring-1 ring-white/10" style={{ animationDelay: "80ms" }}>
                  <LevelAssessmentChat
                    topic={pendingGeneration?.name || fileName}
                    onComplete={(level) => handleAssessmentDone(level)}
                    onSkip={() => handleAssessmentDone(null)}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Course ── */}
        {phase === "course" && (
          <>
            <Helmet>
              <title>{fileName ? `${cleanName(fileName)} — Level Up AI` : "Your AI Course — Level Up AI"}</title>
              <meta name="description" content="Generate personalized animated video courses from any topic or PDF. Six narrated lessons and a 20-question readiness quiz, ready in minutes." />
              <meta name="robots" content="noindex, nofollow" />
              <link rel="canonical" href="https://leveluppedu.app/ai_tutor" />
              <meta property="og:type" content="website" />
              <meta property="og:site_name" content="Level Up AI" />
              <meta property="og:title" content="Level Up AI — Generate Your Course" />
              <meta property="og:description" content="Type a topic or upload your notes. Get 6 animated lessons with narration and a quiz in minutes." />
              <meta property="og:url" content="https://leveluppedu.app/ai_tutor" />
              <meta property="og:image" content="https://leveluppedu.app/logo.png" />
              <meta name="twitter:card" content="summary_large_image" />
              <meta name="twitter:title" content="Level Up AI — Generate Your Course" />
              <meta name="twitter:description" content="Type a topic or upload your notes. Get 6 animated lessons with narration and a quiz in minutes." />
              <meta name="twitter:image" content="https://leveluppedu.app/logo.png" />
              <script type="application/ld+json">{JSON.stringify({
                "@context": "https://schema.org",
                "@type": "WebApplication",
                "name": "Level Up AI",
                "url": "https://leveluppedu.app",
                "description": "AI-powered platform that generates personalized animated video courses from any topic or PDF.",
                "applicationCategory": "EducationApplication",
                "operatingSystem": "Web",
                "offers": { "@type": "Offer", "price": "4.99", "priceCurrency": "USD", "description": "1 full course — 6 animated lessons, narration, and a 20-question quiz" },
                "publisher": { "@type": "Organization", "name": "Level Up AI", "url": "https://leveluppedu.app", "logo": { "@type": "ImageObject", "url": "https://leveluppedu.app/logo.png" } },
              })}</script>
            </Helmet>

            <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0A0B10]/80 px-3 backdrop-blur-xl sm:px-6">
              {isMobile && (
                <button onClick={() => setHistorySidebarCollapsed(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#B9BCCB] hover:bg-white/[0.06]" aria-label="Open library">
                  <Menu className="h-5 w-5" />
                </button>
              )}
              <Ring value={courseDetailsLoading ? 0 : courseProgress} size={36} stroke={3} color={C.mint}>
                <span className="font-mono text-[9px] font-semibold text-[#B9BCCB]">{completedCount}/{lessons.length}</span>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] text-[#6E7389]">
                  {!courseDetailsLoading && generatingCount > 0
                    ? <><RecDot /> <span className="text-[#FFB08A]">{generatingCount} lesson{generatingCount !== 1 ? "s" : ""} generating</span></>
                    : <><Sparkles className="h-3 w-3 text-[#B4A9FF]" /> AI course · {lessons.length} lesson{lessons.length === 1 ? "" : "s"}</>}
                </p>
                {courseDetailsLoading
                  ? <Shimmer className="mt-1 h-4 w-48" />
                  : <h1 className="truncate text-[15px] font-semibold text-white">{cleanName(fileName)}</h1>}
              </div>
              {activeHistoryId && allLessonsReady && !courseDetailsLoading && (
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setShowShareModal(true)} className={cx(BTN_GHOST, "h-9 px-3")} title="Share">
                    <Share2 className="h-4 w-4" /><span className="hidden lg:inline">Share</span>
                  </button>
                  <button onClick={() => setShowPublishModal(true)} className={cx(BTN_SOFT, "h-9 px-3")} title="Publish">
                    <Globe2 className="h-4 w-4 text-[#3DDC97]" /><span className="hidden lg:inline">Publish</span>
                  </button>
                </div>
              )}
              <button
                onClick={() => setCourseSidebarOpen((o) => !o)}
                className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors", courseSidebarOpen && !isMobile ? "bg-white/[0.07] text-white" : "text-[#8A8FA3] hover:bg-white/[0.06] hover:text-white")}
                aria-label="Toggle syllabus"
                title="Syllabus"
              >
                <PanelRight className="h-4 w-4" />
              </button>
            </header>

            <div className="flex min-h-0 flex-1">
              <main className="lu-scroll min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-5xl px-4 py-7 sm:px-8 sm:py-10">
                  {failureBanner && failureBanner.lessonIndex === activeLesson && activeSection === "video" && (
                    <div className="lu-rise mb-6 flex items-start gap-3 rounded-2xl bg-[#FF5C6C]/[0.07] p-4 ring-1 ring-[#FF5C6C]/25">
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#FF5C6C]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">This lesson couldn't be generated</p>
                        <p className="mt-0.5 text-xs text-[#B9BCCB]">Something went wrong while building this video. A retry usually fixes it.</p>
                        <button
                          onClick={() => { handleRetryLesson(failureBanner.lessonIndex); setFailureBanner(null); }}
                          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 text-xs font-semibold text-white ring-1 ring-white/10 transition-colors hover:bg-white/[0.1]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Retry this lesson
                        </button>
                      </div>
                      <button onClick={() => setFailureBanner(null)} className="shrink-0 rounded-md p-1 text-[#8A8FA3] hover:bg-white/5 hover:text-white" aria-label="Dismiss">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Where you are in the thread — the only element here that
                      shows the WHOLE chain rather than the open course's
                      neighbours, so nothing silently disappears when you move
                      along it. */}
                  <PathBreadcrumb steps={pathSteps} activeId={activeHistoryId} onOpen={restoreEntry} />

                  {courseDetailsLoading && <CourseContentSkeleton />}

                  {!courseDetailsLoading && activeSection === "video" && currentLesson && (
                    <LessonStage
                      lesson={currentLesson}
                      onComplete={() => markComplete(currentLesson.id)}
                      onRetry={(crashInfo) => handleRetryLesson(activeLesson, crashInfo)}
                      retrying={retryingLesson === activeLesson}
                      retryingLabel={retryingLabel}
                      courseId={activeHistoryId}
                      lessonNumber={activeLesson + 1}
                      totalLessons={lessons.length}
                      nextLessonTitle={lessons[activeLesson + 1]?.title}
                      nextLessonReady={lessonStatuses[activeLesson + 1] === "ready" && !!lessons[activeLesson + 1]?.code}
                      onPlayNext={() => setActiveLesson((i) => i + 1)}
                      controls={lessonControls}
                    />
                  )}

                  {!courseDetailsLoading && activeSection === "quiz" && (
                    <QuizStage
                      questions={quizQuestions}
                      timeAllocationMinutes={activeCourseQuizMinutes}
                      onSubmit={handleQuizSubmit}
                      courseStatus={activeEntry?.status}
                      lessonsBuilt={allLessonsReady}
                      onRegenerate={activeHistoryId ? async () => {
                        const questions = await regenerateQuiz(activeHistoryId);
                        setQuizQuestions(questions);
                        // The endpoint also flips the course to `ready`, so
                        // mirror that here rather than waiting for a poll
                        // that may already have stopped.
                        setHistory((prev) => prev.map((e) =>
                          e.id === activeHistoryId ? { ...e, questions, status: "ready" as const } : e
                        ));
                      } : undefined}
                    />
                  )}

                  {!courseDetailsLoading && activeSection === "results" && (
                    <ResultsStage
                      answers={quizAnswers}
                      questions={quizQuestions}
                      serverResult={serverQuizResult}
                      courseId={activeHistoryId}
                      onFeedback={() => setShowFeedback(true)}
                      lessons={lessons}
                      lessonStatuses={lessonStatuses}
                      onSelectLesson={(i) => {
                        analytics.lessonViewed({ lesson: i + 1 });
                        setActiveLesson(i);
                        setActiveSection("video");
                      }}
                      credits={credits}
                      courseTiers={courseTiers}
                      onGenerateFollowUp={startFollowUpCourse}
                      onRequestTopUp={() => setShowPaywall(true)}
                      starting={startingFollowUp}
                      startError={followUpError}
                      lineage={lineageChain}
                    />
                  )}

                  {/* Everything this course led to, below whatever section is
                      open — so a follow-up started from the results builds
                      here instead of replacing the page. */}
                </div>
              </main>

              <SyllabusPanel
                open={courseSidebarOpen}
                isMobile={isMobile}
                onClose={() => setCourseSidebarOpen(false)}
                loading={courseDetailsLoading}
                lessons={lessons}
                lessonStatuses={lessonStatuses}
                lessonProgresses={lessonProgresses}
                activeSection={activeSection}
                activeLesson={activeLesson}
                allLessonsReady={allLessonsReady}
                quizDone={quizDone}
                quizCount={quizQuestions.length || activeEntry?.mcqCount || 0}
                quizScore={serverQuizResult?.pct ?? activeEntry?.quizScore ?? null}
                activeTopic={fileName}
                pathBefore={pathBefore}
                pathAfter={followUpChildren}
                onSelectPathLesson={(courseId, lesson) => {
                  selectPathLesson(courseId, lesson);
                  if (isMobile) setCourseSidebarOpen(false);
                }}
                onOpenCourse={(entry, section) => {
                  restoreEntry(entry);
                  // restoreEntry picks a section of its own (video, or results
                  // if its quiz is done); an explicit one wins — this runs
                  // after, so its state update is the one that lands.
                  if (section) setActiveSection(section);
                  if (isMobile) setCourseSidebarOpen(false);
                }}
                onSelectLesson={(i) => {
                  analytics.lessonViewed({ lesson: i + 1 });
                  setActiveLesson(i);
                  setActiveSection("video");
                  if (isMobile) setCourseSidebarOpen(false);
                }}
                onSelectQuiz={() => { setActiveSection("quiz"); if (isMobile) setCourseSidebarOpen(false); }}
                onSelectResults={() => { setActiveSection("results"); if (isMobile) setCourseSidebarOpen(false); }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}