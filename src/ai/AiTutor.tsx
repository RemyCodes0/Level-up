"use client";

import { useState, useRef, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  startCourseGeneration,
  pollCourse,
  listCourses,
  deleteCourse,
  retryLesson,
  unlockCourse,
  getCourseStatus,
  getNextSuggestions,
} from "../api/CourseApi";
import type { CourseFromAPI, NextCourseSuggestion } from "../api/CourseApi";
import { getProgress, markLessonWatched } from "../api/ProgressApi";
import { submitQuiz as submitQuizApi, getLatestAttempt } from "../api/QuizApi";
import type { QuizResult } from "../api/QuizApi";
import { LevelAssessmentChat } from "../components/LevelAssessmentChat";
import { DynamicPlayer } from "../remotion/DynamicPlayer";
import { ReferralCard } from "../components/ReferralCard";
import { DownloadLessonButton } from "../components/DownloadLessonButton";
import { analytics, resetUser } from "../lib/analytics";

// Download/export requires headless Chrome + 2GB+ RAM — works locally but
// OOMs on Render's Starter (512MB). Gate it behind an env var so it only
// shows in local dev. Add VITE_ENABLE_DOWNLOAD=true to your local .env to enable.
const DOWNLOAD_ENABLED = import.meta.env.VITE_ENABLE_DOWNLOAD === "true";
import {
  FileText, Play, CheckCircle, Circle, Lock, Brain, Sparkles,
  ChevronRight, ChevronLeft, Clock, BarChart2, BookOpen, AlertCircle,
  Award, TrendingUp, TrendingDown, ClipboardList, Trophy,
  X, Check, PanelLeft, PenSquare, GraduationCap, Loader2, Trash2, XCircle,
  CreditCard, Zap, Minus, Plus, MessageSquare, Share2, Globe2,
  User as UserIcon, LogOut, ChevronsUpDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// The export/download feature now works in production — the backend was
// migrated to a Docker-based Render service with the system libraries
// headless Chrome needs (see Dockerfile). No longer gated behind an env var.

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

type AppPhase = "upload" | "assessment" | "course";
type CourseSection = "video" | "quiz" | "results";
type LessonStatus = "ready" | "generating" | "failed" | "locked";

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
  // Server-computed, enriched quiz result (score is re-derived server-side,
  // never trusted from the client) — set once a submission round-trips or a
  // prior attempt is restored on load. ResultsSection prefers this over
  // recomputing from quizAnswers when present.
  serverQuizResult?: QuizResult | null;
}

interface Lesson {
  id: number;
  title: string;
  duration: string;
  completed: boolean;
  description: string;
  keyPoints: string[];
  videoUrl?: string | null;
  code?: string | null;
  totalFrames?: number | null;
  error?: string | null;
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
  freeTrialUsed: boolean;
  canGenerate: boolean;
}

const MOCK_LESSONS: Lesson[] = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  title: `Lesson ${i + 1}`,
  duration: "~2:00",
  completed: false,
  description: i === 0 ? "Generating your first lesson…" : "Generating…",
  keyPoints: ["Loading…", "Loading…", "Loading…", "Loading…"],
  videoUrl: null,
  code: null,
  totalFrames: null,
}));

const MOCK_QUESTIONS: MCQQuestion[] = [];

const HISTORY_PAGE_SIZE = 8;

const PROGRESS_DURATION_MS = 6 * 60 * 1000;
const PROGRESS_TICK_MS = 300;
const PROGRESS_MAX = 99;

function useLessonProgress(statuses: LessonStatus[]): number[] {
  const [progresses, setProgresses] = useState<number[]>(statuses.map(() => 0));
  const startTimesRef = useRef<(number | null)[]>(statuses.map(() => null));
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusKey = statuses.join(",");

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    setProgresses((prev) => {
      const next = [...prev];
      statuses.forEach((s, i) => {
        if (s === "ready") next[i] = 100;
        if (s === "failed") { next[i] = 0; startTimesRef.current[i] = null; }
      });
      return next;
    });
    const activeIdx = statuses.findIndex((s) => s === "generating");
    if (activeIdx === -1) return;
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
  }, [statusKey]);

  return progresses;
}

function PaywallModal({ onClose, courseId, courseName }: { onClose: () => void; courseId?: string | null; courseName?: string }) {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const prefillEmail = user?.email || "";

  const handleSubmit = async () => {
    if (!email.trim()) { setError("Please enter your email so we can notify you."); return; }
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      // Send as feedback so it lands in your admin email + Feedback collection.
      // The waitlist flag is embedded in the message so you can filter later.
      await fetch(`${BASE_URL}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rating: 5,
          message: `[WAITLIST] ${email}\n\n${feedback.trim() || "(no feedback provided)"}`,
          courseId: courseId || undefined,
          courseName: courseName || undefined,
        }),
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>

        {submitted ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="h-7 w-7 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">You're on the list!</h2>
            <p className="text-sm text-slate-500 mb-6">
              We'll email you at <span className="font-semibold text-slate-700">{email}</span> the moment payments go live. Thank you for your patience.
            </p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">
              Keep watching
            </button>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Zap className="h-7 w-7 text-amber-500" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 text-center mb-2">
              Payments coming soon
            </h2>
            <p className="text-slate-500 text-center text-sm mb-1">
              We're working on setting up our payment system. Leave your email and we'll let you know the moment you can unlock more courses.
            </p>
            <p className="text-slate-400 text-center text-xs mb-6">
              Each course will be <span className="font-semibold text-slate-600">$4.99</span> — 6 animated lessons, narration, and a quiz.
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Your email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={email || prefillEmail}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Feedback <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="How's the app so far? Anything you'd love to see?"
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><MessageSquare className="h-4 w-4" /> Notify me when payments go live</>}
            </button>

            <p className="text-xs text-slate-400 text-center mt-3">
              No spam — only one email when payments launch.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
import { FeedbackModal } from "../feedback/FeedBackModel";
import { ShareModal } from "../components/ShareModal";
import { PublishModal } from "../components/PublishModal";
import { PDFDocument } from "pdf-lib";

function UploadPhase({ onGenerate, credits }: {
  onGenerate: (fileName: string, file?: File | null) => void;
  credits: Credits | null;
}) {
  const [inputValue, setInputValue] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [checkingPages, setCheckingPages] = useState(false);
  const [pageCountError, setPageCountError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_PAGES = 100;

  const locked = (credits && !credits.canGenerate);

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

  const handleSubmit = () => {
    if (locked) return;
    if (exceedsPageLimit) return;
    if (!uploadedFile && !inputValue.trim()) return;
    onGenerate(uploadedFile ? uploadedFile.name : inputValue.trim(), uploadedFile);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (locked) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [inputValue]);

  const canSubmit = !locked && !exceedsPageLimit && !checkingPages && (!!uploadedFile || inputValue.trim().length > 0);
  const suggestions = ["Cell Biology lecture slides", "Calculus II integration techniques", "Data structures & algorithms", "Electromagnetic waves"];

  return (
    <>
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 pb-8">
          <div className="text-center mb-10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-2 rounded-xl">
                <img src="/logo.png" alt="Level Up Logo" className="h-8 w-8 object-cover rounded-lg" />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2 px-2">What would you like to learn?</h1>
            <p className="text-muted-foreground text-sm sm:text-base px-2">Describe your topic or upload your course materials — AI generates your full course.</p>
          </div>
          <div className="w-full max-w-2xl">
            <div className={`bg-white rounded-2xl border shadow-lg overflow-hidden relative ${locked ? "border-slate-300 opacity-60" : "border-slate-200"}`}>
              {locked && (
                <div className="absolute inset-0 z-10 bg-slate-100/50 backdrop-blur-[1px] rounded-2xl flex items-center justify-center cursor-not-allowed">
                  <div className="text-center px-6">
                    <Lock className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">Free trial used</p>
                  </div>
                </div>
              )}
              {uploadedFile && (
                <div className="px-4 pt-3">
                  <div className={`inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm flex-wrap ${exceedsPageLimit ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                    <FileText className={`h-4 w-4 shrink-0 ${exceedsPageLimit ? "text-amber-600" : "text-blue-600"}`} />
                    <span className={`font-medium max-w-[160px] sm:max-w-[260px] truncate ${exceedsPageLimit ? "text-amber-800" : "text-blue-800"}`}>{uploadedFile.name}</span>
                    <span className={`text-xs ${exceedsPageLimit ? "text-amber-500" : "text-blue-400"}`}>{(uploadedFile.size / 1024 / 1024).toFixed(1)} MB</span>
                    {checkingPages && (
                      <span className="text-xs text-blue-400 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking pages…
                      </span>
                    )}
                    {pageCount !== null && (
                      <span className={`text-xs font-semibold ${exceedsPageLimit ? "text-amber-700" : "text-blue-500"}`}>
                        {pageCount} page{pageCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <button onClick={() => { setUploadedFile(null); setPageCount(null); setPageCountError(null); }} className={`ml-1 ${exceedsPageLimit ? "text-amber-500 hover:text-amber-800" : "text-blue-400 hover:text-blue-700"}`}><X className="h-3.5 w-3.5" /></button>
                  </div>
                  {exceedsPageLimit && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      This PDF has {pageCount} pages — our limit is {MAX_PAGES}. Please trim it before uploading.
                    </p>
                  )}
                  {pageCountError && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {pageCountError}
                    </p>
                  )}
                </div>
              )}
              <div className="px-4 pt-3 pb-2">
                <textarea ref={textareaRef} value={inputValue} onChange={(e) => { if (!locked) setInputValue(e.target.value); }} onKeyDown={handleKeyDown}
                  placeholder={locked ? "Free trial used — purchase courses to continue" : "Explain DNA replication and cell division…"} rows={1}
                  disabled={locked}
                  className={`w-full resize-none bg-transparent placeholder:text-slate-400 text-base focus:outline-none leading-relaxed ${locked ? "text-slate-400 cursor-not-allowed" : "text-slate-800"}`}
                  style={{ minHeight: "40px", maxHeight: "160px" }} />
              </div>
              <div className="flex items-center justify-between px-3 pb-3 pt-1 gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <input ref={fileRef} type="file" accept=".pdf,.pptx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                  <button onClick={() => !locked && fileRef.current?.click()} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${locked ? "text-slate-300 cursor-not-allowed" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`} title="Attach PDF or PPTX">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </button>
                  <span className="text-xs text-slate-400 ml-1 hidden sm:inline truncate">PDF ({MAX_PAGES} pages max) · PPTX — up to 25MB</span>
                  <span className="text-xs text-slate-400 ml-1 sm:hidden">PDF/PPTX</span>
                </div>
                <button onClick={handleSubmit} disabled={!canSubmit} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${canSubmit ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-center px-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setInputValue(s)} className="text-xs text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1.5 hover:border-slate-400 hover:text-slate-700 transition-all shadow-sm">{s}</button>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 mt-5 px-2">Lesson 1 ready in ~5 minutes · remaining lessons load while you watch</p>
          </div>
        </div>
      </div>
    </>
  );
}

// A generation-in-progress preview, in the spirit of v0.dev's build
// animation: instead of a bare spinner, it shows the thing actually being
// assembled — a filmstrip of scene blocks lighting up in sequence (the
// lesson's scenes being storyboarded), a narration waveform pulsing (the
// voiceover being recorded), and a caption that cycles through the real
// pipeline stages (scene plan -> audio -> animation code) rather than one
// static "loading" message the whole time.
const GENERATION_PHASES = ["Planning the scenes…", "Writing narration…", "Recording the voiceover…", "Animating the lesson…"];
const SCENE_BLOCK_COUNT = 8;

function GeneratingLessonPreview() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % GENERATION_PHASES.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden shadow-xl border border-slate-800 bg-slate-950 aspect-video flex flex-col items-center justify-center text-center px-4 sm:px-6">
      <style>{`
        @keyframes lgp-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
        @keyframes lgp-block { 0%, 100% { opacity: 0.35; transform: scaleY(0.85); } 50% { opacity: 1; transform: scaleY(1); } }
        @keyframes lgp-wave { 0%, 100% { height: 18%; } 50% { height: 100%; } }
        @keyframes lgp-drift { 0% { transform: translate(-10%, -10%); } 100% { transform: translate(10%, 10%); } }
      `}</style>

      {/* Ambient drifting glow, consistent with the app's dark-surface accents elsewhere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-1/2 left-1/2 h-[160%] w-[160%] rounded-full bg-blue-600/10 blur-3xl"
          style={{ animation: "lgp-drift 6s ease-in-out infinite alternate" }}
        />
      </div>

      {/* Filmstrip — scene blocks building in, staggered */}
      <div className="relative z-10 flex items-center gap-1.5 sm:gap-2 mb-6">
        {Array.from({ length: SCENE_BLOCK_COUNT }).map((_, i) => (
          <div
            key={i}
            className="relative w-6 h-9 sm:w-8 sm:h-12 rounded-[3px] bg-gradient-to-b from-slate-700 to-slate-800 overflow-hidden"
            style={{ animation: "lgp-block 2.4s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
          >
            <div
              className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              style={{ animation: "lgp-shimmer 2.4s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
            />
          </div>
        ))}
      </div>

      {/* Narration waveform */}
      <div className="relative z-10 flex items-end justify-center gap-[3px] h-7 sm:h-8 mb-5 w-40 sm:w-48">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-blue-400/80"
            style={{ animation: "lgp-wave 1s ease-in-out infinite", animationDelay: `${(i % 7) * 0.09}s` }}
          />
        ))}
      </div>

      <p className="relative z-10 text-white font-semibold text-base sm:text-lg flex items-center gap-2">
        <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
        {GENERATION_PHASES[phase]}
      </p>
      <p className="relative z-10 text-white/50 text-xs sm:text-sm mt-1">This usually takes about 6 minutes.</p>
    </div>
  );
}

// 5 seconds before a lesson ends, if the next one is already generated, show
// a Coursera-style "Up next" prompt the user can click to jump ahead early
// instead of waiting for playback to finish naturally.
const UP_NEXT_THRESHOLD_SEC = 5;
const FPS = 30;

function VideoPlayer({
  lesson, onComplete, onRetry, retrying, courseId, lessonNumber,
  nextLessonTitle, nextLessonReady, onPlayNext,
}: {
  lesson: Lesson; onComplete: () => void; onRetry?: () => void; retrying?: boolean; courseId: string | null; lessonNumber: number;
  nextLessonTitle?: string | null; nextLessonReady?: boolean; onPlayNext?: () => void;
}) {
  const [showUpNext, setShowUpNext] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // New lesson (including moving to the next one) — reset both so the
  // prompt can appear again on THIS lesson's own final seconds, not stay
  // dismissed forever from a previous lesson.
  useEffect(() => { setShowUpNext(false); setDismissed(false); }, [lessonNumber]);

  const handleFrameUpdate = (frame: number) => {
    if (!lesson.totalFrames || !nextLessonTitle || !nextLessonReady || dismissed) return;
    const secondsRemaining = (lesson.totalFrames - frame) / FPS;
    setShowUpNext(secondsRemaining > 0 && secondsRemaining <= UP_NEXT_THRESHOLD_SEC);
  };

  const playNext = () => {
    setDismissed(true);
    setShowUpNext(false);
    onPlayNext?.();
  };

  if (!lesson.code) {
    return (
      <div className="space-y-4">
        <GeneratingLessonPreview />
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-4 sm:p-5">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm sm:text-base"><BookOpen className="h-4 w-4 text-blue-600 shrink-0" />Key points in this lesson</h3>
          <ul className="space-y-2">
            {lesson.keyPoints.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />{pt}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }
  const handleEnded = () => {
    onComplete();
    // Persists watched state server-side — before this, "completed" was
    // pure client state (see the old markComplete) and reset to false on
    // every refresh. courseId is null only for the pre-generation MOCK
    // preview state, so this never fires for a course that doesn't exist yet.
    if (courseId) markLessonWatched(courseId, lessonNumber).catch((err) => console.error("Failed to persist watched state:", err));
  };
  return (
    <div className="space-y-4">
      <div className="relative">
        <DynamicPlayer
          key={`lesson-${lessonNumber}`}
          code={lesson.code}
          durationInFrames={lesson.totalFrames ?? 3600}
          onEnded={handleEnded}
          onRetry={onRetry}
          retrying={retrying}
          onFrameUpdate={handleFrameUpdate}
        />
        {showUpNext && (
          <div className="absolute bottom-4 right-4 z-10 bg-slate-900/95 backdrop-blur rounded-xl shadow-xl border border-white/10 p-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 font-medium">Up next</p>
              <p className="text-sm text-white font-semibold truncate max-w-[180px]">{nextLessonTitle}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { setDismissed(true); setShowUpNext(false); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={playNext}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
              >
                <Play className="h-3 w-3 fill-white" /> Play next
              </button>
            </div>
          </div>
        )}
      </div>
      <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm sm:text-base"><BookOpen className="h-4 w-4 text-blue-600 shrink-0" />Key points in this lesson</h3>
        <ul className="space-y-2">
          {lesson.keyPoints.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />{pt}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function QuizSection({ questions, onSubmit }: { questions: MCQQuestion[]; onSubmit: (answers: QuizAnswer[]) => void }) {
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [submitted, timeLeft]);

  if (!questions || questions.length === 0) {
    return (
      <div className="text-center py-16">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-3" />
        <p className="text-slate-600">Your assessment is still being prepared…</p>
      </div>
    );
  }

  const answered = (id: number) => answers.find((a) => a.questionId === id);
  const select = (qId: number, opt: number) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionId === qId);
      if (existing >= 0) { const n = [...prev]; n[existing] = { questionId: qId, selected: opt }; return n; }
      return [...prev, { questionId: qId, selected: opt }];
    });
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const q = questions[currentQ];
  const handleSubmit = () => { setSubmitted(true); onSubmit(answers); };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-purple-600 shrink-0" />Learning Assessment</h2>
          <p className="text-sm text-muted-foreground">{answers.length} of {questions.length} answered</p>
        </div>
        <div className={`self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold text-sm ${timeLeft < 300 ? "bg-red-50 text-red-600 border border-red-200" : "bg-slate-100 text-slate-700"}`}>
          <Clock className="h-4 w-4" />{fmt(timeLeft)}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {questions.map((qq, i) => (
          <button key={qq.id} onClick={() => setCurrentQ(i)} className={`w-7 h-7 rounded-md text-xs font-semibold transition-all ${i === currentQ ? "bg-blue-600 text-white shadow-sm" : answered(qq.id) ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{i + 1}</button>
        ))}
      </div>
      <Card className="border-0 shadow-lg bg-white/90 backdrop-blur p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">{q.topic}</Badge>
          <span className="text-sm text-muted-foreground font-medium">Q{currentQ + 1} / {questions.length}</span>
        </div>
        <p className="text-base font-medium text-slate-900 mb-5 leading-relaxed">{q.question}</p>
        <div className="space-y-3">
          {q.options.map((opt, i) => {
            const sel = answered(q.id)?.selected === i;
            return (
              <button key={i} onClick={() => select(q.id, i)} className={`w-full text-left p-3 sm:p-4 rounded-xl border text-sm transition-all ${sel ? "border-blue-500 bg-blue-50 text-blue-900 font-medium" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"}`}>
                <span className={`inline-flex w-6 h-6 rounded-full border text-xs items-center justify-center mr-3 font-semibold shrink-0 ${sel ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-slate-500"}`}>{String.fromCharCode(65 + i)}</span>
                {opt}
              </button>
            );
          })}
        </div>
      </Card>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => setCurrentQ((qi) => Math.max(0, qi - 1))} disabled={currentQ === 0} className="text-xs sm:text-sm px-3 sm:px-4"><ChevronLeft className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Previous</span></Button>
        {currentQ < questions.length - 1 ? (
          <Button onClick={() => setCurrentQ((qi) => Math.min(questions.length - 1, qi + 1))} className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-3 sm:px-4"><span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button onClick={handleSubmit} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs sm:text-sm px-3 sm:px-4" disabled={answers.length < questions.length}><Trophy className="h-4 w-4 mr-2 shrink-0" /><span className="hidden sm:inline">Submit </span>Assessment</Button>
        )}
      </div>
      {answers.length < questions.length && currentQ === questions.length - 1 && (
        <p className="text-center text-xs text-amber-600">{questions.length - answers.length} question{questions.length - answers.length !== 1 ? "s" : ""} still unanswered</p>
      )}
    </div>
  );
}

function ResultsSection({
  answers, questions, serverResult, courseId,
}: {
  answers: QuizAnswer[]; questions: MCQQuestion[]; serverResult?: QuizResult | null; courseId?: string | null;
}) {
  // Prefer the server-graded result (score is never trusted from the client
  // — see quizController.js's scoreAnswers) once the submit round-trip has
  // resolved; fall back to the client computation only for the brief window
  // before that, so results still render instantly on submit.
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
  const topics = serverResult
    ? [...serverResult.topicBreakdown].sort((a, b) => b.pct - a.pct)
    : clientTopics;
  const strengths = topics.filter((t) => t.pct >= 70);
  const weaknesses = topics.filter((t) => t.pct < 70);
  const readinessLabel = serverResult?.readinessLabel ?? (pct >= 85 ? "Exam Ready" : pct >= 70 ? "Almost Ready" : pct >= 55 ? "Needs Review" : "Needs Tutoring");
  const readinessColor = pct >= 85 ? "emerald" : pct >= 70 ? "blue" : pct >= 55 ? "amber" : "red";

  const [suggestions, setSuggestions] = useState<NextCourseSuggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg bg-white/90 backdrop-blur overflow-hidden">
        <div className={`bg-${readinessColor}-50 border-b border-${readinessColor}-100 p-4 sm:p-6`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 flex items-center gap-2"><Award className={`h-5 w-5 sm:h-6 sm:w-6 text-${readinessColor}-600 shrink-0`} />Your Learning Readiness Score</h2>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">{score} / {total} correct</p>
            </div>
            <div className="text-center">
              <div className={`text-4xl sm:text-5xl font-black text-${readinessColor}-600`}>{pct}%</div>
              <Badge className={`bg-${readinessColor}-100 text-${readinessColor}-700 border-${readinessColor}-200 mt-1`}>{readinessLabel}</Badge>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-white/60 rounded-full h-3">
              <div className={`bg-${readinessColor}-500 h-3 rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {serverResult?.trend && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <TrendingUp className={`h-4 w-4 ${serverResult.trend.delta >= 0 ? "text-emerald-600" : "text-red-500 rotate-180"}`} />
              {serverResult.trend.delta > 0 ? "+" : ""}{serverResult.trend.delta}% vs. your last attempt ({serverResult.trend.previousPct}%) · attempt #{serverResult.trend.attemptNumber}
            </div>
          )}
        </div>
        <div className="p-4 sm:p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2 text-sm sm:text-base"><BarChart2 className="h-4 w-4 text-slate-500 shrink-0" /> Topic breakdown</h3>
          <div className="space-y-3">
            {topics.map(({ topic, pct: tPct, correct, total }) => (
              <div key={topic}>
                <div className="flex justify-between text-sm mb-1 gap-2">
                  <span className="text-slate-700 font-medium truncate">{topic}</span>
                  <span className={`font-semibold shrink-0 ${tPct >= 70 ? "text-emerald-600" : "text-red-500"}`}>{correct}/{total} · {tPct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${tPct >= 70 ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${tPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-4 sm:p-5">
          <h3 className="font-semibold text-emerald-700 mb-3 flex items-center gap-2 text-sm sm:text-base"><TrendingUp className="h-4 w-4 shrink-0" /> Strengths</h3>
          {strengths.length === 0 ? <p className="text-sm text-muted-foreground">Keep studying — strengths will emerge!</p> : (
            <ul className="space-y-2">{strengths.map(({ topic, pct: tPct }) => (
              <li key={topic} className="flex items-center justify-between text-sm gap-2">
                <span className="flex items-center gap-2 truncate"><Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{topic}</span>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs shrink-0">{tPct}%</Badge>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-4 sm:p-5">
          <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2 text-sm sm:text-base"><TrendingDown className="h-4 w-4 shrink-0" /> Needs review</h3>
          {weaknesses.length === 0 ? <p className="text-sm text-muted-foreground">Excellent — no weak areas detected!</p> : (
            <ul className="space-y-2">{weaknesses.map(({ topic, pct: tPct }) => (
              <li key={topic} className="flex items-center justify-between text-sm gap-2">
                <span className="flex items-center gap-2 truncate"><AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />{topic}</span>
                <Badge className="bg-red-50 text-red-600 border-red-200 text-xs shrink-0">{tPct}%</Badge>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>

      {serverResult && serverResult.missedQuestions.length > 0 && (
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-4 sm:p-5">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm sm:text-base">Review missed questions ({serverResult.missedQuestions.length})</h3>
          <div className="space-y-3">
            {serverResult.missedQuestions.map((m) => (
              <div key={m.questionId} className="border-l-2 border-red-300 pl-3">
                <p className="text-sm font-medium text-slate-800">{m.question}</p>
                <p className="text-xs text-slate-500 mt-1">Your answer: <span className="text-red-500">{m.yourAnswer ?? "No answer"}</span></p>
                <p className="text-xs text-slate-500">Correct answer: <span className="text-emerald-600">{m.correctAnswer}</span></p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {courseId && (
        <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-5">
          {!suggestions ? (
            <button
              onClick={() => {
                setLoadingSuggestions(true);
                getNextSuggestions(courseId).then(setSuggestions).catch(() => setSuggestions([])).finally(() => setLoadingSuggestions(false));
              }}
              disabled={loadingSuggestions}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-blue-700"
            >
              {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              What should I learn next?
            </button>
          ) : (
            <>
              <h3 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" /> Continue your learning journey</h3>
              {suggestions.length === 0 ? (
                <p className="text-sm text-slate-500">Couldn't load suggestions right now.</p>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((s, i) => (
                    <div key={i} className="bg-white rounded-lg border border-slate-100 p-3">
                      <p className="text-sm font-medium text-slate-800">{s.topic}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}

// ChatGPT-style account button anchored at the bottom of the sidebar —
// avatar + name, hover reveals a menu (same controlled-open pattern as the
// top navbar's user menu in components/navbar/Navbar.tsx, kept in sync so
// both feel like the same interaction across the app). Opens upward
// (side="top") since the trigger sits at the bottom of the viewport.
function SidebarUserMenu({ user, onLogout }: { user: { name: string; email: string; role?: string } | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openMenu = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  const scheduleClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 150); };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  if (!user) return null;

  return (
    <div className="border-t border-slate-100 p-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {user.name?.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={6}
          className="w-64 p-2"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <DropdownMenuLabel className="px-2 py-1.5">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer rounded-md">
            <a href="/profile" className="flex items-center gap-2 px-2 py-2">
              <UserIcon className="h-4 w-4 text-purple-600" />
              <span className="font-medium">Profile</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md">
            <div className="flex items-center gap-2 px-2 py-1">
              <LogOut className="h-4 w-4" />
              <span className="font-medium">Sign out</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function HistorySidebar({ history, activeId, onSelect, onNew, onDelete, collapsed, onToggle, loading, error, credits, onBuy, isMobile, onFeedback, hasMore, loadingMore, onLoadMore, user, onLogout }: {
  history: HistoryEntry[]; activeId: string | null;
  onSelect: (entry: HistoryEntry) => void; onNew: () => void;
  onDelete: (id: string) => void; collapsed: boolean; onToggle: () => void;
  loading: boolean; error: boolean;
  credits: Credits | null; onBuy: () => void;
  isMobile?: boolean;
  onFeedback: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  user: { name: string; email: string; role?: string } | null;
  onLogout: () => void;
}) {
  const groups = history.reduce<Record<string, HistoryEntry[]>>((acc, e) => {
    const diffDays = Math.floor((Date.now() - e.createdAt.getTime()) / 86400000);
    const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : diffDays <= 7 ? "Previous 7 days" : diffDays <= 30 ? "Previous 30 days" : e.createdAt.toLocaleString("default", { month: "long", year: "numeric" });
    if (!acc[label]) acc[label] = [];
    acc[label].push(e);
    return acc;
  }, {});
  const groupOrder = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days"];
  const sortedGroups = [...groupOrder.filter((g) => groups[g]), ...Object.keys(groups).filter((g) => !groupOrder.includes(g))];

  return (
    <>
      {isMobile && !collapsed && (
        <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]" onClick={onToggle} />
      )}
      <aside className={`${
        isMobile
          ? `fixed top-0 left-0 z-40 h-full ${collapsed ? "-translate-x-full" : "translate-x-0"} w-[80vw] max-w-64`
          : `${collapsed ? "w-0" : "w-64"} shrink-0`
      } transition-all duration-300 bg-white border-r border-slate-200 flex flex-col overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
        <button onClick={onToggle} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"><PanelLeft className="h-4 w-4" /></button>
        <button onClick={onNew} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"><PenSquare className="h-4 w-4" /></button>
      </div>

      {credits && (
        <div className={`px-3 py-3 border-b-2 ${
          !credits.canGenerate
            ? "border-amber-300 bg-amber-50"
            : !credits.freeTrialUsed
            ? "border-emerald-300 bg-emerald-50"
            : "border-blue-300 bg-blue-50"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-600" /> Free trial
            </span>
            {credits.freeTrialUsed ? (
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-slate-400" /> Used
              </span>
            ) : (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Available
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-blue-600" /> Courses
            </span>
            <span className={`text-sm font-extrabold ${credits.courseCredits > 0 ? "text-blue-700" : "text-slate-500"}`}>
              {Math.max(credits.courseCredits, 0)} remaining
            </span>
          </div>
          {!credits.canGenerate && (
            <button onClick={onBuy}
              className="w-full mt-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold transition-all shadow-md flex items-center justify-center gap-1.5">
              <CreditCard className="h-4 w-4" /> Buy more courses
            </button>
          )}
          {credits.canGenerate && credits.courseCredits <= 2 && credits.freeTrialUsed && (
            <button onClick={onBuy}
              className="w-full mt-1 py-2.5 rounded-xl border-2 border-blue-300 bg-white text-blue-700 hover:bg-blue-50 text-sm font-bold transition-all flex items-center justify-center gap-1.5">
              <CreditCard className="h-4 w-4" /> Top up courses
            </button>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-2">
        {history.length === 0 ? (
          <div className="px-4 py-8 text-center">
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 text-slate-300 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-400">Loading courses…</p>
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-7 w-7 text-red-300 mx-auto mb-2" />
                <p className="text-xs text-red-400 font-medium">Failed to load courses</p>
                <p className="text-xs text-slate-400 mt-1">Check your connection and try again.</p>
              </>
            ) : (
              <>
                <GraduationCap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No courses yet.</p>
                <p className="text-xs text-slate-400 mt-0.5">Generate one to get started.</p>
              </>
            )}
          </div>
        ) : sortedGroups.map((group) => (
          <div key={group} className="mb-1">
            <p className="px-3 py-1.5 text-xs font-semibold text-slate-400">{group}</p>
            {groups[group].map((entry) => {
              const isActive = entry.id === activeId;
              return (
                <div key={entry.id} className={`group/item relative flex items-center mx-1 rounded-lg transition-all ${isActive ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                  <button onClick={() => onSelect(entry)} className={`flex-1 text-left px-3 py-2.5 min-w-0 ${isActive ? "text-slate-900" : "text-slate-700"}`}>
                    <p className="text-xs font-medium leading-snug line-clamp-1 pr-6">{entry.fileName.replace(/\.(pdf|pptx)$/i, "")}</p>
                    {entry.quizScore !== null && (
                      <p className="text-xs font-semibold text-emerald-600 mt-1">Quiz: {entry.quizScore}%</p>
                    )}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${entry.fileName.replace(/\.(pdf|pptx)$/i, "")}"? This cannot be undone.`)) onDelete(entry.id); }}
                    className="absolute right-2 top-2 w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover/item:opacity-100 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {hasMore && (
          <div className="px-3 pt-1 pb-2">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              {loadingMore ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</>
              ) : (
                "See more"
              )}
            </button>
          </div>
        )}
      </nav>

      <ReferralCard />
      <div className="border-t border-slate-100 p-3">
        <button
          onClick={onFeedback}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-bold hover:bg-emerald-100 hover:border-emerald-300 transition-all"
        >
          <MessageSquare className="h-4 w-4" />
          Send feedback
        </button>
      </div>
      <SidebarUserMenu user={user} onLogout={onLogout} />
    </aside>
    </>
  );
}

function LessonStatusIcon({ status, completed, isActive }: { status: LessonStatus; completed: boolean; isActive: boolean }) {
  if (completed) return <CheckCircle className="h-4 w-4 text-emerald-500" />;
  if (status === "locked") return <Lock className="h-4 w-4 text-amber-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === "generating") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
  if (isActive) return <Play className="h-4 w-4 text-blue-600 fill-blue-600" />;
  return <Circle className="h-4 w-4 text-slate-300" />;
}

export default function AILearningPage() {
  const [phase, setPhase] = useState<AppPhase>("upload");
  const [fileName, setFileName] = useState("");
  // Holds the topic + file the user submitted, while the optional level-check
  // chat runs, before we actually kick off generation.
  const [pendingGeneration, setPendingGeneration] = useState<{ name: string; file?: File | null } | null>(null);
  const router = useNavigate();
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

  // course_completed: fire once, only for courses generated in THIS session
  // (startedCoursesRef), the first time all their lessons finish. Guards prevent
  // re-firing on re-render or when revisiting an already-finished course.
  const startedCoursesRef = useRef<Set<string>>(new Set());
  const completedFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ready = lessonStatuses.length > 0 && lessonStatuses.every((s) => s === "ready" || s === "failed");
    if (
      ready &&
      activeHistoryId &&
      startedCoursesRef.current.has(activeHistoryId) &&
      !completedFiredRef.current.has(activeHistoryId)
    ) {
      completedFiredRef.current.add(activeHistoryId);
      analytics.courseCompleted({ courseId: activeHistoryId });
    }
  }, [lessonStatuses, activeHistoryId]);
  // Tracks whether the CURRENTLY VIEWED course was generated using the free
  // trial — used to decide whether to auto-prompt for feedback after the
  // quiz results are shown (see the quiz onSubmit handler below).
  const [activeCourseIsFreeTrial, setActiveCourseIsFreeTrial] = useState(false);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [retryingLesson, setRetryingLesson] = useState<number | null>(null);
  const [unlockingCourse, setUnlockingCourse] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [failureBanner, setFailureBanner] = useState<{ lessonIndex: number; title: string; error: string | null } | null>(null);
  const seenFailuresRef = useRef<Set<number>>(new Set());

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  // Same sign-out sequence as Profile.tsx's handleLogout — clears the real
  // session keys (auth-context's signOut clears a different, unused
  // "levelup_user" key, so it's not reused here).
  const handleLogout = () => {
    analytics.loggedOut();
    resetUser();
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    router("/login");
  };

  const bgTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollCancelRef = useRef<(() => void) | null>(null);
  const lessonProgresses = useLessonProgress(lessonStatuses);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) {
      setHistorySidebarCollapsed(true);
      setCourseSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => { if (!user) router("/login"); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      fetchCredits();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const fetchCredits = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/payment/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCredits(await res.json());
    } catch (err) { console.error("Failed to fetch credits:", err); }
  };

  useEffect(() => { fetchCredits(); }, []);
  useEffect(() => { return () => { if (pollCancelRef.current) pollCancelRef.current(); }; }, []);

  const mapCourseToEntry = (c: CourseFromAPI): HistoryEntry => {
    const mappedLessons: Lesson[] = (c.lessons || []).map((l, i) => ({
      id: i + 1, title: l.title || `Lesson ${i + 1}`, duration: "~2:00", completed: false,
      description: l.description || "", keyPoints: l.keyPoints?.length ? l.keyPoints : ["", "", "", ""],
      videoUrl: l.videoUrl, code: l.code ?? null, totalFrames: l.totalFrames ?? null, error: l.error ?? null,
    }));
    const mappedStatuses: LessonStatus[] = (c.lessons || []).map((l) =>
      l.status === "ready" ? "ready" : l.status === "failed" ? "failed" : l.status === "locked" ? "locked" : "generating"
    );
    return {
      id: c._id, fileName: c.topic,
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      completedLessons: 0, quizScore: null,
      lessons: mappedLessons.length ? mappedLessons : MOCK_LESSONS,
      lessonStatuses: mappedStatuses.length ? mappedStatuses : MOCK_LESSONS.map(() => "generating" as LessonStatus),
      quizAnswers: [], quizDone: false, questions: c.questions || [],
      isFreeTrialCourse: !!c.isFreeTrialCourse,
    };
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

        // Restore watched/quiz state from the server — mapCourseToEntry
        // above always starts every lesson "not watched" and every quiz
        // "not done" (it has no server data yet), which is exactly why
        // that state used to vanish on every refresh. This background pass
        // fills it back in per-course without blocking the initial render.
        // The full enriched result (not just the score) is stashed on the
        // entry so ResultsSection can render it without recomputing from
        // scratch — the raw per-question answers aren't sent back down for
        // an already-graded attempt, only the graded result.
        entries.forEach((entry) => {
          Promise.all([
            getProgress(entry.id).catch(() => null),
            getLatestAttempt(entry.id).catch(() => null),
          ]).then(([progress, attempt]) => {
            if (cancelled || (!progress?.lessons.length && !attempt)) return;
            setHistory((prev) => prev.map((e) => {
              if (e.id !== entry.id) return e;
              const lessons = progress?.lessons.length
                ? e.lessons.map((l) => ({ ...l, completed: !!progress!.lessons.find((p) => p.lessonNumber === l.id)?.watched }))
                : e.lessons;
              return attempt
                ? { ...e, lessons, quizDone: true, quizScore: attempt.pct, serverQuizResult: attempt }
                : { ...e, lessons };
            }));
          });
        });

        const stillGenerating = courses.find((c) => c.status === "generating");
        if (stillGenerating && !cancelled) {
          pollCancelRef.current = pollCourse(stillGenerating._id, (course: CourseFromAPI) => {
            setHistory((prev) => prev.map((e) => e.id !== course._id ? e : {
              ...e,
              lessons: e.lessons.map((l, i) => { const a = course.lessons[i]; if (!a) return l; return { ...l, title: a.title ?? l.title, description: a.description ?? l.description, keyPoints: a.keyPoints?.length ? a.keyPoints : l.keyPoints, videoUrl: a.videoUrl, code: a.code ?? l.code, totalFrames: a.totalFrames ?? l.totalFrames, error: a.error ?? null }; }),
              lessonStatuses: course.lessons.map((l) => l.status === "ready" ? "ready" : l.status === "failed" ? "failed" : l.status === "locked" ? "locked" : "generating"),
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
    // Feedback trigger moved to firing after quiz RESULTS are shown (see the
    // quiz onSubmit handler below) — now that the free trial gives the whole
    // course upfront, "finishing lesson 1" isn't a meaningful checkpoint
    // anymore. The natural moment to ask for feedback is after the user has
    // experienced the complete product: all 6 lessons + their quiz score.
  };

  useEffect(() => {
    lessonStatuses.forEach((status, i) => {
      if (status === "failed" && !seenFailuresRef.current.has(i)) {
        seenFailuresRef.current.add(i);
        setFailureBanner({
          lessonIndex: i,
          title: lessons[i]?.title || `Lesson ${i + 1}`,
          error: lessons[i]?.error ?? null,
        });
      }
      if (status !== "failed" && seenFailuresRef.current.has(i)) {
        seenFailuresRef.current.delete(i);
      }
    });
  }, [lessonStatuses, lessons]);

  const handleRetryLesson = async (lessonIndex: number) => {
    if (!activeHistoryId || retryingLesson !== null) return;
    analytics.lessonRegenerated({ lesson: lessonIndex + 1 });
    setRetryingLesson(lessonIndex);
    try {
      await retryLesson(activeHistoryId, lessonIndex);
      setLessonStatuses((prev) => prev.map((s, i) => i === lessonIndex ? "generating" : s));
      setLessons((prev) => prev.map((l, i) => i === lessonIndex ? { ...l, code: null, totalFrames: null } : l));
      if (pollCancelRef.current) pollCancelRef.current();
      pollCancelRef.current = pollCourse(activeHistoryId, (course: CourseFromAPI) => {
        setLessons((prev) => prev.map((l, i) => { const a = course.lessons[i]; if (!a) return l; return { ...l, title: a.title ?? l.title, description: a.description ?? l.description, keyPoints: a.keyPoints?.length ? a.keyPoints : l.keyPoints, videoUrl: a.videoUrl, code: a.code ?? l.code, totalFrames: a.totalFrames ?? l.totalFrames, error: a.error ?? null }; }));
        if (course.lessons.length > 0) setLessonStatuses(MOCK_LESSONS.map((_, i) => mapStatus(course.lessons[i]?.status ?? "")));
        if (course.questions?.length) setQuizQuestions(course.questions);
      });
    } catch (err) {
      console.error("Failed to retry lesson:", err);
      alert("Failed to regenerate lesson. Please try again.");
    } finally {
      setRetryingLesson(null);
    }
  };

  const handleUnlockCourse = async () => {
    if (!activeHistoryId || unlockingCourse) return;
    setUnlockingCourse(true);
    try {
      await unlockCourse(activeHistoryId);

      // FIX 1 — credit counter not dropping: unlockCourse only returns
      // { ok, message }, not the new balance, so re-fetch credits explicitly
      // right away instead of waiting for a page reload.
      fetchCredits();

      // Optimistically flip locked lessons to "generating" so the UI doesn't
      // sit on stale "locked" state while we wait for the server.
      setLessonStatuses((prev) => prev.map((s) => s === "locked" ? "generating" : s));
      if (pollCancelRef.current) pollCancelRef.current();

      // FIX 2 — lessons 2-6 only appearing after refresh: fetch the course
      // status ONCE immediately, instead of waiting for pollCourse's first
      // internal tick (which can take several seconds). The backend has
      // already unlocked and started generating; this pulls that fresh state
      // into the UI right now rather than on the next poll cycle or reload.
      try {
        const course = await getCourseStatus(activeHistoryId);
        setLessons((prev) => prev.map((l, i) => { const a = course.lessons[i]; if (!a) return l; return { ...l, title: a.title ?? l.title, description: a.description ?? l.description, keyPoints: a.keyPoints?.length ? a.keyPoints : l.keyPoints, videoUrl: a.videoUrl, code: a.code ?? l.code, totalFrames: a.totalFrames ?? l.totalFrames, error: a.error ?? null }; }));
        if (course.lessons.length > 0) setLessonStatuses(MOCK_LESSONS.map((_, i) => mapStatus(course.lessons[i]?.status ?? "")));
        if (course.questions?.length) setQuizQuestions(course.questions);
      } catch (statusErr) {
        console.error("Failed to fetch course status right after unlock:", statusErr);
        // Not fatal — the poll loop below will pick it up shortly.
      }

      // Keep polling as a backup / to track ongoing lesson generation.
      pollCancelRef.current = pollCourse(activeHistoryId, (course: CourseFromAPI) => {
        setLessons((prev) => prev.map((l, i) => { const a = course.lessons[i]; if (!a) return l; return { ...l, title: a.title ?? l.title, description: a.description ?? l.description, keyPoints: a.keyPoints?.length ? a.keyPoints : l.keyPoints, videoUrl: a.videoUrl, code: a.code ?? l.code, totalFrames: a.totalFrames ?? l.totalFrames, error: a.error ?? null }; }));
        if (course.lessons.length > 0) setLessonStatuses(MOCK_LESSONS.map((_, i) => mapStatus(course.lessons[i]?.status ?? "")));
        if (course.questions?.length) setQuizQuestions(course.questions);
      });
    } catch (err: any) {
      console.error("Failed to unlock course:", err);
      alert(err?.message || "Couldn't unlock this course. Make sure you have a course credit, then try again.");
    } finally {
      setUnlockingCourse(false);
    }
  };

  useEffect(() => {
    if (!activeHistoryId) return;
    setHistory((prev) => prev.map((e) => e.id !== activeHistoryId ? e : {
      ...e, lessons, lessonStatuses, completedLessons: lessons.filter((l) => l.completed).length,
      quizAnswers, quizDone, questions: quizQuestions,
      quizScore: quizDone ? Math.round((quizAnswers.filter((a) => { const q = quizQuestions.find((q) => q.id === a.questionId); return q && q.correct === a.selected; }).length / Math.max(quizQuestions.length, 1)) * 100) : null,
    }));
  }, [lessons, lessonStatuses, quizAnswers, quizDone, quizQuestions]);

  const handleDeleteCourse = async (id: string) => {
    setHistory((prev) => prev.filter((e) => e.id !== id));
    if (activeHistoryId === id) { if (pollCancelRef.current) pollCancelRef.current(); setActiveHistoryId(null); setPhase("upload"); }
    try { await deleteCourse(id); } catch (err) { console.error("Failed to delete course:", err); }
  };

  const mapStatus = (s: string): LessonStatus => s === "ready" ? "ready" : s === "failed" ? "failed" : s === "locked" ? "locked" : "generating";

  // Called when the user submits a topic/file from the upload screen.
  // Instead of generating immediately, it now routes into the optional
  // level-check chat first. The actual generation happens in runGeneration,
  // called by the assessment's onComplete/onSkip.
  const startNewCourse = async (name: string, file?: File | null) => {
    setPendingGeneration({ name, file });
    setFileName(name);
    setPhase("assessment");
  };

  // Does the real generation work. `level` is the result of the level check
  // (or null if skipped/failed) and gets passed through to the backend so
  // the course can be pitched appropriately.
  const runGeneration = async (
    name: string,
    file: File | null | undefined,
    level: "beginner" | "intermediate" | "advanced" | null
  ) => {
    analytics.courseStarted({ topic: name, source: file ? (file.name.toLowerCase().endsWith(".pptx") ? "pptx" : "pdf") : "topic" });
    bgTimersRef.current.forEach(clearTimeout); bgTimersRef.current = [];
    if (pollCancelRef.current) pollCancelRef.current();
    // Jump straight into the course view (not a separate "generating" screen) —
    // the per-lesson progress bars in the course sidebar already show each
    // lesson generating live, so a full-screen generating phase is redundant.
    setFileName(name); setPhase("course");
    // Show lessons in their loading state immediately while the request fires.
    setLessons(MOCK_LESSONS.map((l) => ({ ...l, completed: false, videoUrl: null, code: null, totalFrames: null })));
    setLessonStatuses(MOCK_LESSONS.map(() => "generating"));
    setActiveSection("video"); setActiveLesson(0);
    // Determine free-trial status from credits BEFORE this call — this is
    // the exact same condition the backend's checkCredits middleware uses
    // (freeTrialUsed === false means this generation will consume the trial).
    const willUseFreeTrial = !!(credits && !credits.freeTrialUsed);
    setActiveCourseIsFreeTrial(willUseFreeTrial);
    try {
      const { courseId } = await startCourseGeneration(name, file, level);
      startedCoursesRef.current.add(courseId);
      fetchCredits();
      const freshLessons = MOCK_LESSONS.map((l) => ({ ...l, completed: false, videoUrl: null, code: null, totalFrames: null }));
      const freshStatuses: LessonStatus[] = freshLessons.map(() => "generating");
      setHistory((prev) => [{ id: courseId, fileName: name, createdAt: new Date(), completedLessons: 0, quizScore: null, lessons: freshLessons, lessonStatuses: freshStatuses, quizAnswers: [], quizDone: false, questions: [] }, ...prev]);
      setActiveHistoryId(courseId); setLessons(freshLessons); setLessonStatuses(freshStatuses);
      setQuizQuestions([]); setActiveSection("video"); setActiveLesson(0); setQuizAnswers([]); setQuizDone(false);
      seenFailuresRef.current.clear(); setFailureBanner(null);
      pollCancelRef.current = pollCourse(courseId, (course: CourseFromAPI) => {
        setLessons((prev) => prev.map((l, i) => { const a = course.lessons[i]; if (!a) return l; return { ...l, title: a.title ?? l.title, description: a.description ?? l.description, keyPoints: a.keyPoints?.length ? a.keyPoints : l.keyPoints, videoUrl: a.videoUrl, code: a.code ?? l.code, totalFrames: a.totalFrames ?? l.totalFrames, error: a.error ?? null }; }));
        if (course.lessons.length > 0) setLessonStatuses(MOCK_LESSONS.map((_, i) => mapStatus(course.lessons[i]?.status ?? "")));
        if (course.questions?.length) setQuizQuestions(course.questions);
      });
    } catch (err: any) {
      console.error(err);
      setPhase("upload");
      if (!err?.status || err.status !== 402) alert("Failed to generate course. Please try again.");
    }
  };

  // Bridges the assessment result into generation. Used by both onComplete
  // (level determined) and onSkip (level = null).
  const handleAssessmentDone = (level: "beginner" | "intermediate" | "advanced" | null) => {
    if (!pendingGeneration) { setPhase("upload"); return; }
    const { name, file } = pendingGeneration;
    setPendingGeneration(null);
    runGeneration(name, file, level);
  };

  const restoreEntry = (entry: HistoryEntry) => {
    if (pollCancelRef.current) pollCancelRef.current();
    setActiveHistoryId(entry.id); setFileName(entry.fileName); setLessons(entry.lessons);
    setActiveCourseIsFreeTrial(!!entry.isFreeTrialCourse);
    setLessonStatuses(entry.lessonStatuses ?? entry.lessons.map(() => "ready"));
    setQuizAnswers(entry.quizAnswers); setQuizDone(entry.quizDone); setQuizQuestions(entry.questions ?? []);
    setServerQuizResult(entry.serverQuizResult ?? null);
    setActiveSection(entry.quizDone ? "results" : "video"); setActiveLesson(0); setPhase("course");
    if (entry.lessonStatuses?.some((s) => s === "generating")) {
      pollCancelRef.current = pollCourse(entry.id, (course: CourseFromAPI) => {
        setLessons((prev) => prev.map((l, i) => { const a = course.lessons[i]; if (!a) return l; return { ...l, title: a.title ?? l.title, description: a.description ?? l.description, keyPoints: a.keyPoints?.length ? a.keyPoints : l.keyPoints, videoUrl: a.videoUrl, code: a.code ?? l.code, totalFrames: a.totalFrames ?? l.totalFrames, error: a.error ?? null }; }));
        setLessonStatuses(MOCK_LESSONS.map((_, i) => mapStatus(course.lessons[i]?.status ?? "")));
        if (course.questions?.length) setQuizQuestions(course.questions);
      });
    }
  };

  const allLessonsReady = lessonStatuses.every((s) => s === "ready" || s === "failed");

  if (phase === "assessment") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex flex-col">
        {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
        <div className="flex flex-1 overflow-hidden relative">
          <HistorySidebar history={history} activeId={activeHistoryId} onSelect={(e) => { restoreEntry(e); if (isMobile) setHistorySidebarCollapsed(true); }} onNew={() => { setPendingGeneration(null); setPhase("upload"); }} onDelete={handleDeleteCourse} collapsed={historySidebarCollapsed} onToggle={() => setHistorySidebarCollapsed((c) => !c)} loading={historyLoading} error={historyError} credits={credits} onBuy={() => setShowPaywall(true)} isMobile={isMobile} onFeedback={() => setShowFeedback(true)} hasMore={historyHasMore} loadingMore={loadingMoreHistory} onLoadMore={loadMoreHistory} user={user} onLogout={handleLogout} />
          {historySidebarCollapsed && <button onClick={() => setHistorySidebarCollapsed(false)} className="absolute left-0 top-4 z-10 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-r-lg text-slate-500 hover:text-slate-800 shadow-sm transition-all"><PanelLeft className="h-4 w-4" /></button>}
          <div className="flex-1 overflow-hidden flex flex-col bg-white/40">
            <LevelAssessmentChat
              topic={pendingGeneration?.name || fileName}
              onComplete={(level) => handleAssessmentDone(level)}
              onSkip={() => handleAssessmentDone(null)}
            />
          </div>
        </div>
      </div>
    );
  }

  if (phase === "upload") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex flex-col">
        {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
        <div className="flex flex-1 overflow-hidden relative">
          <HistorySidebar history={history} activeId={activeHistoryId} onSelect={(e) => { restoreEntry(e); if (isMobile) setHistorySidebarCollapsed(true); }} onNew={() => {}} onDelete={handleDeleteCourse} collapsed={historySidebarCollapsed} onToggle={() => setHistorySidebarCollapsed((c) => !c)} loading={historyLoading} error={historyError} credits={credits} onBuy={() => setShowPaywall(true)} isMobile={isMobile} onFeedback={() => setShowFeedback(true)} hasMore={historyHasMore} loadingMore={loadingMoreHistory} onLoadMore={loadMoreHistory} user={user} onLogout={handleLogout} />
          {historySidebarCollapsed && <button onClick={() => setHistorySidebarCollapsed(false)} className="absolute left-0 top-4 z-10 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-r-lg text-slate-500 hover:text-slate-800 shadow-sm transition-all"><PanelLeft className="h-4 w-4" /></button>}
          <div className="flex-1 overflow-y-auto"><UploadPhase onGenerate={startNewCourse} credits={credits} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
        {showShareModal && activeHistoryId && <ShareModal courseId={activeHistoryId} onClose={() => setShowShareModal(false)} />}
        {showPublishModal && activeHistoryId && <PublishModal courseId={activeHistoryId} onClose={() => setShowPublishModal(false)} />}
      <Helmet>
        {/* ── Primary ── */}
        <title>{fileName ? `${fileName.replace(/\.(pdf|pptx)$/i, "")} — Level Up AI` : "Your AI Course — Level Up AI"}</title>
        <meta name="description" content="Generate personalized animated video courses from any topic or PDF. Six narrated lessons and a 20-question readiness quiz, ready in minutes." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://leveluppedu.app/ai_tutor" />

        {/* ── Open Graph ── */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Level Up AI" />
        <meta property="og:title" content="Level Up AI — Generate Your Course" />
        <meta property="og:description" content="Type a topic or upload your notes. Get 6 animated lessons with narration and a quiz in minutes." />
        <meta property="og:url" content="https://leveluppedu.app/ai_tutor" />
        <meta property="og:image" content="https://leveluppedu.app/logo.png" />

        {/* ── Twitter/X ── */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Level Up AI — Generate Your Course" />
        <meta name="twitter:description" content="Type a topic or upload your notes. Get 6 animated lessons with narration and a quiz in minutes." />
        <meta name="twitter:image" content="https://leveluppedu.app/logo.png" />

        {/* ── Structured Data: WebApplication ── */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "Level Up AI",
          "url": "https://leveluppedu.app",
          "description": "AI-powered platform that generates personalized animated video courses from any topic or PDF.",
          "applicationCategory": "EducationApplication",
          "operatingSystem": "Web",
          "offers": {
            "@type": "Offer",
            "price": "4.99",
            "priceCurrency": "USD",
            "description": "1 full course — 6 animated lessons, narration, and a 20-question quiz"
          },
          "publisher": {
            "@type": "Organization",
            "name": "Level Up AI",
            "url": "https://leveluppedu.app",
            "logo": {
              "@type": "ImageObject",
              "url": "https://leveluppedu.app/logo.png"
            }
          }
        })}</script>
      </Helmet>
      <div className="flex h-screen relative">
        <HistorySidebar history={history} activeId={activeHistoryId} onSelect={(e) => { restoreEntry(e); if (isMobile) setHistorySidebarCollapsed(true); }} onNew={() => setPhase("upload")} onDelete={handleDeleteCourse} collapsed={historySidebarCollapsed} onToggle={() => setHistorySidebarCollapsed((c) => !c)} loading={historyLoading} error={historyError} credits={credits} onBuy={() => setShowPaywall(true)} isMobile={isMobile} onFeedback={() => setShowFeedback(true)} hasMore={historyHasMore} loadingMore={loadingMoreHistory} onLoadMore={loadMoreHistory} user={user} onLogout={handleLogout} />
        {historySidebarCollapsed && <button onClick={() => setHistorySidebarCollapsed(false)} className="absolute left-0 top-4 z-10 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-r-lg text-slate-500 hover:text-slate-800 shadow-sm transition-all"><PanelLeft className="h-4 w-4" /></button>}

        {isMobile && courseSidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]" onClick={() => setCourseSidebarOpen(false)} />
        )}
        <aside className={`${
          isMobile
            ? `fixed top-0 right-0 z-40 h-full w-[85vw] max-w-72 ${courseSidebarOpen ? "translate-x-0" : "translate-x-full"}`
            : `${courseSidebarOpen ? "w-72" : "w-0 overflow-hidden"} shrink-0`
        } transition-all duration-300 bg-white border-l border-slate-200 flex flex-col shadow-sm`}>
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">AI Course</span>
            </div>
            <h2 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">{fileName}</h2>
            {!allLessonsReady && (
              <div className="mt-3 flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                <p className="text-xs text-blue-700">{lessonStatuses.filter((s) => s === "generating").length} lesson{lessonStatuses.filter((s) => s === "generating").length !== 1 ? "s" : ""} generating…</p>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            <div className="px-4 mb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Video Lessons</p>
            </div>
            {lessons.map((lesson, i) => {
              const status = lessonStatuses[i];
              const isGenerating = status === "generating";
              const isFailed = status === "failed";
              const isLockedStatus = status === "locked";
              const isWaiting = isGenerating && lessonStatuses.findIndex((s) => s === "generating") !== i;
              const isActive = activeSection === "video" && activeLesson === i;
              // Disabled while generating OR while locked behind the free trial
              const isDisabled = isGenerating || isLockedStatus;
              const progress = lessonProgresses[i] ?? 0;
              return (
                <button key={lesson.id} disabled={isDisabled}
                  onClick={() => { if (!isDisabled) { analytics.lessonViewed({ lesson: i + 1 }); setActiveLesson(i); setActiveSection("video"); if (isMobile) setCourseSidebarOpen(false); } }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all ${isActive ? "bg-blue-50 border-r-2 border-blue-600" : isFailed ? "opacity-70 hover:bg-red-50/50" : isLockedStatus ? "opacity-70 cursor-not-allowed" : isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
                >
                  <div className="mt-0.5 shrink-0">
                    <LessonStatusIcon status={status} completed={lesson.completed} isActive={isActive} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate ${isActive ? "text-blue-700" : isFailed ? "text-red-500" : isLockedStatus ? "text-amber-700" : "text-slate-700"}`}>
                      {i + 1}. {lesson.title}
                    </p>
                    {isLockedStatus ? (
                      <p className="text-xs text-amber-500 mt-0.5 flex items-center gap-1"><Lock className="h-3 w-3" /> Buy credits to unlock</p>
                    ) : isGenerating ? (
                      <div className="mt-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-blue-400">{isWaiting ? "waiting…" : "generating…"}</span>
                          <span className="text-xs font-semibold text-blue-500">{isWaiting ? "—" : `${Math.round(progress)}%`}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                          {isWaiting ? <div className="h-1 w-0" /> : (
                            <div className="h-1 rounded-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-all duration-500" style={{ width: `${progress}%` }} />
                          )}
                        </div>
                      </div>
                    ) : isFailed ? (
                      <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Generation failed</p>
                    ) : (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> {lesson.duration}</p>
                    )}
                  </div>
                </button>
              );
            })}

            <div className="px-4 mt-4 mb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Assessment</p>
            </div>
            <button disabled={!allLessonsReady} onClick={() => { if (allLessonsReady) { setActiveSection("quiz"); if (isMobile) setCourseSidebarOpen(false); } }}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all ${activeSection === "quiz" ? "bg-purple-50 border-r-2 border-purple-600" : !allLessonsReady ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"}`}>
              <ClipboardList className={`h-4 w-4 mt-0.5 ${activeSection === "quiz" ? "text-purple-600" : quizDone ? "text-emerald-500" : "text-slate-400"}`} />
              <div>
                <p className={`text-xs font-semibold ${activeSection === "quiz" ? "text-purple-700" : "text-slate-700"}`}>Final Quiz</p>
                <p className="text-xs text-muted-foreground">{quizQuestions.length || 20} questions</p>
              </div>
              {!allLessonsReady && <Lock className="h-3 w-3 text-slate-300 ml-auto mt-1" />}
            </button>
            <button disabled={!quizDone} onClick={() => { if (quizDone) { setActiveSection("results"); if (isMobile) setCourseSidebarOpen(false); } }}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all ${activeSection === "results" ? "bg-amber-50 border-r-2 border-amber-500" : !quizDone ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"}`}>
              <Trophy className={`h-4 w-4 mt-0.5 ${activeSection === "results" ? "text-amber-600" : quizDone ? "text-amber-500" : "text-slate-400"}`} />
              <div>
                <p className={`text-xs font-semibold ${activeSection === "results" ? "text-amber-700" : "text-slate-700"}`}>Results & Recommendations</p>
                <p className="text-xs text-muted-foreground">Readiness score</p>
              </div>
              {!quizDone && <Lock className="h-3 w-3 text-slate-300 ml-auto mt-1" />}
            </button>
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 py-6 sm:py-8">
            {failureBanner && failureBanner.lessonIndex === activeLesson && (
              <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-3 sm:px-4 py-3">
                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-700">
                    This lesson couldn't be generated
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">
                    Something went wrong while building this video. You can try again — it usually works on a retry.
                  </p>
                  <button
                    onClick={() => {
                      handleRetryLesson(failureBanner.lessonIndex);
                      setFailureBanner(null);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900 bg-white border border-red-300 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Retry this lesson
                  </button>
                </div>
                <button onClick={() => setFailureBanner(null)} className="text-red-400 hover:text-red-600 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <button onClick={() => setCourseSidebarOpen((o) => !o)} className="mb-4 text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors">
              {courseSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {courseSidebarOpen ? "Hide" : "Show"} course nav
            </button>
            {activeSection === "video" && (
              <div className="space-y-6">
                <VideoPlayer
                  lesson={lessons[activeLesson]}
                  onComplete={() => markComplete(lessons[activeLesson].id)}
                  onRetry={() => handleRetryLesson(activeLesson)}
                  retrying={retryingLesson === activeLesson}
                  courseId={activeHistoryId}
                  lessonNumber={activeLesson + 1}
                  nextLessonTitle={lessons[activeLesson + 1]?.title}
                  nextLessonReady={lessonStatuses[activeLesson + 1] === "ready" && !!lessons[activeLesson + 1]?.code}
                  onPlayNext={() => setActiveLesson((i) => i + 1)}
                />
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button variant="outline" disabled={activeLesson === 0} onClick={() => setActiveLesson((i) => i - 1)} className="text-xs sm:text-sm px-3 sm:px-4 shrink-0"><ChevronLeft className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Previous</span></Button>
                  {DOWNLOAD_ENABLED && activeHistoryId && lessonStatuses[activeLesson] === "ready" && lessons[activeLesson]?.code && (
                    <DownloadLessonButton
                      courseId={activeHistoryId}
                      lessonNumber={activeLesson + 1}
                      lessonTitle={lessons[activeLesson]?.title}
                    />
                  )}
                  {activeHistoryId && allLessonsReady && (
                    <Button
                      variant="outline"
                      className="text-xs sm:text-sm px-3 sm:px-4 shrink-0 border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => setShowShareModal(true)}
                    >
                      <Share2 className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Share</span>
                    </Button>
                  )}
                  {activeHistoryId && allLessonsReady && (
                    <Button
                      variant="outline"
                      className="text-xs sm:text-sm px-3 sm:px-4 shrink-0 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => setShowPublishModal(true)}
                    >
                      <Globe2 className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Publish</span>
                    </Button>
                  )}
                  {activeLesson < lessons.length - 1 ? (
                    lessonStatuses[activeLesson + 1] === "locked" ? (
                      <Button
                        className="bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm px-3 sm:px-4"
                        disabled={unlockingCourse}
                        onClick={handleUnlockCourse}
                      >
                        {unlockingCourse ? (
                          <><Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /><span className="hidden sm:inline">Unlocking…</span></>
                        ) : (
                          <><Lock className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Buy credits to continue</span><span className="sm:hidden">Unlock</span></>
                        )}
                      </Button>
                    ) : (
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-3 sm:px-4"
                        disabled={lessonStatuses[activeLesson + 1] === "generating"}
                        onClick={() => setActiveLesson((i) => i + 1)}>
                        {lessonStatuses[activeLesson + 1] === "generating"
                          ? (<><Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /><span className="hidden sm:inline">Next lesson generating…</span></>)
                          : (<><span className="hidden sm:inline">Next Lesson</span><span className="sm:hidden">Next</span> <ChevronRight className="h-4 w-4 ml-1" /></>)}
                      </Button>
                    )
                  ) : (
                    <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs sm:text-sm px-3 sm:px-4" disabled={!allLessonsReady} onClick={() => setActiveSection("quiz")}>
                      <ClipboardList className="h-4 w-4 sm:mr-2 shrink-0" /><span className="hidden sm:inline">Take the </span>Quiz
                    </Button>
                  )}
                </div>
              </div>
            )}
            {activeSection === "quiz" && <QuizSection questions={quizQuestions} onSubmit={(answers) => {
              setQuizAnswers(answers); setQuizDone(true); setActiveSection("results");
              // Score is recomputed and stored server-side — the client-sent
              // answers are never trusted as-is for the score itself. This is
              // also what makes the quiz score survive a refresh (previously
              // pure client state, gone the moment the page reloaded).
              setServerQuizResult(null); // stale prior result, if any, while the fresh one loads
              if (activeHistoryId) {
                submitQuizApi(activeHistoryId, answers)
                  .then(setServerQuizResult)
                  .catch((err) => console.error("Failed to persist quiz result:", err));
              }
              // The free trial now includes the full course + quiz. Right after
              // the user sees their results is the natural moment to ask for
              // feedback — they've just experienced the complete product. The
              // 3s delay lets them actually see the score before the modal
              // interrupts them, rather than popping up the instant they submit.
              if (activeCourseIsFreeTrial) {
                setTimeout(() => setShowFeedback(true), 3000);
              }
            }} />}
            {activeSection === "results" && (
              <>
                <ResultsSection answers={quizAnswers} questions={quizQuestions} serverResult={serverQuizResult} courseId={activeHistoryId} />
                <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-5 mt-6">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 mb-1 text-sm sm:text-base">How was this course?</h3>
                      <p className="text-xs sm:text-sm text-slate-500 mb-3">Your feedback helps us improve — it only takes a minute.</p>
                      <button
                        onClick={() => setShowFeedback(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs sm:text-sm font-medium hover:bg-blue-50 hover:border-blue-300 transition-all"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Share your feedback
                      </button>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}