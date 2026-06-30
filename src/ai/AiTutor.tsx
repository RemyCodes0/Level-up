"use client";

import { useState, useRef, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  startCourseGeneration,
  pollCourse,
  listCourses,
  deleteCourse,
  retryLesson,
  unlockCourse,
  getCourseStatus,
} from "../api/CourseApi";
import type { CourseFromAPI } from "../api/CourseApi";
import { LevelAssessmentChat } from "../components/LevelAssessmentChat";
import { DynamicPlayer } from "../remotion/DynamicPlayer";
import { DownloadLessonButton } from "../components/DownloadLessonButton";
import {
  FileText, Play, CheckCircle, Circle, Lock, Brain, Sparkles,
  ChevronRight, ChevronLeft, Clock, BarChart2, BookOpen, AlertCircle,
  Award, TrendingUp, TrendingDown, ClipboardList, Trophy,
  X, Check, PanelLeft, PenSquare, GraduationCap, Loader2, Trash2, XCircle,
  CreditCard, Zap, Minus, Plus, MessageSquare,
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

function PaywallModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  const PRICE_PER_CREDIT = 4.99;

  const handleBuy = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/payment/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.message || "Failed to create checkout. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("Couldn't reach the payment server. Check your connection and try again.");
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

        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Zap className="h-7 w-7 text-white" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 text-center mb-2">
          Get another course
        </h2>
        <p className="text-slate-500 text-center text-sm mb-6">
          One course includes 6 animated lessons, voiceover narration, and a 20-question quiz.
        </p>

        <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
          {[
            "6 AI-generated animated video lessons",
            "Synced voiceover narration per lesson",
            "20-question personalized quiz",
            "Upload a PDF or type any topic",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4 px-1 gap-2">
          <span className="text-sm text-slate-500">1 course credit</span>
          <span className="text-lg sm:text-xl font-bold text-slate-900 whitespace-nowrap">${PRICE_PER_CREDIT.toFixed(2)}</span>
        </div>

        <Button
          onClick={handleBuy}
          disabled={loading}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Redirecting to checkout…</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span>Pay ${PRICE_PER_CREDIT.toFixed(2)}</span>
            </div>
          )}
        </Button>

        <p className="text-xs text-slate-400 text-center mt-3">
          Secure payment via Dodo Payments · Credits added instantly
        </p>
      </div>
    </div>
  );
}
const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
import { FeedbackModal } from "../feedback/FeedBackModel";
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
                  <span className="text-xs text-slate-400 ml-1 hidden sm:inline truncate">PDF (10MB, 30 pages max) · PPTX (convert to PDF before uploading)</span>
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

function VideoPlayer({ lesson, onComplete, onRetry, retrying, courseId, lessonNumber }: { lesson: Lesson; onComplete: () => void; onRetry?: () => void; retrying?: boolean; courseId: string | null; lessonNumber: number }) {
  if (!lesson.code) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden shadow-xl border border-slate-200 bg-slate-900 aspect-video flex flex-col items-center justify-center text-center px-4 sm:px-6">
          <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 text-blue-400 animate-spin mb-4" />
          <p className="text-white font-semibold text-base sm:text-lg">Preparing this lesson…</p>
          <p className="text-white/60 text-xs sm:text-sm mt-1">Your lesson is being generated. This usually takes about 6 minutes.</p>
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
  return (
    <div className="space-y-4">
      <DynamicPlayer key={`lesson-${lessonNumber}`} code={lesson.code} durationInFrames={lesson.totalFrames ?? 3600} onEnded={onComplete} onRetry={onRetry} retrying={retrying} />
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

function ResultsSection({ answers, questions }: { answers: QuizAnswer[]; questions: MCQQuestion[] }) {
  const score = answers.filter((a) => { const q = questions.find((q) => q.id === a.questionId); return q && q.correct === a.selected; }).length;
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const topicBreakdown = questions.reduce<Record<string, { correct: number; total: number }>>((acc, q) => {
    const ans = answers.find((a) => a.questionId === q.id);
    if (!acc[q.topic]) acc[q.topic] = { correct: 0, total: 0 };
    acc[q.topic].total++;
    if (ans && ans.selected === q.correct) acc[q.topic].correct++;
    return acc;
  }, {});
  const topics = Object.entries(topicBreakdown).map(([topic, data]) => ({ topic, ...data, pct: Math.round((data.correct / data.total) * 100) })).sort((a, b) => b.pct - a.pct);
  const strengths = topics.filter((t) => t.pct >= 70);
  const weaknesses = topics.filter((t) => t.pct < 70);
  const readinessLabel = pct >= 85 ? "Exam Ready" : pct >= 70 ? "Almost Ready" : pct >= 55 ? "Needs Review" : "Needs Tutoring";
  const readinessColor = pct >= 85 ? "emerald" : pct >= 70 ? "blue" : pct >= 55 ? "amber" : "red";

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg bg-white/90 backdrop-blur overflow-hidden">
        <div className={`bg-${readinessColor}-50 border-b border-${readinessColor}-100 p-4 sm:p-6`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 flex items-center gap-2"><Award className={`h-5 w-5 sm:h-6 sm:w-6 text-${readinessColor}-600 shrink-0`} />Your Learning Readiness Score</h2>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">{score} / {questions.length} correct</p>
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
    </div>
  );
}

function HistorySidebar({ history, activeId, onSelect, onNew, onDelete, collapsed, onToggle, loading, error, credits, onBuy, isMobile, onFeedback, hasMore, loadingMore, onLoadMore }: {
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

      <div className="border-t border-slate-100 p-3">
        <button
          onClick={onFeedback}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-bold hover:bg-emerald-100 hover:border-emerald-300 transition-all"
        >
          <MessageSquare className="h-4 w-4" />
          Send feedback
        </button>
      </div>
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
  const [courseSidebarOpen, setCourseSidebarOpen] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [retryingLesson, setRetryingLesson] = useState<number | null>(null);
  const [unlockingCourse, setUnlockingCourse] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [failureBanner, setFailureBanner] = useState<{ lessonIndex: number; title: string; error: string | null } | null>(null);
  const seenFailuresRef = useRef<Set<number>>(new Set());

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

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

  const markComplete = (lessonId: number) => setLessons((prev) => prev.map((l) => l.id === lessonId ? { ...l, completed: true } : l));

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
    try {
      const { courseId } = await startCourseGeneration(name, file, level);
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
    setLessonStatuses(entry.lessonStatuses ?? entry.lessons.map(() => "ready"));
    setQuizAnswers(entry.quizAnswers); setQuizDone(entry.quizDone); setQuizQuestions(entry.questions ?? []);
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
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}
        <div className="flex flex-1 overflow-hidden relative">
          <HistorySidebar history={history} activeId={activeHistoryId} onSelect={(e) => { restoreEntry(e); if (isMobile) setHistorySidebarCollapsed(true); }} onNew={() => { setPendingGeneration(null); setPhase("upload"); }} onDelete={handleDeleteCourse} collapsed={historySidebarCollapsed} onToggle={() => setHistorySidebarCollapsed((c) => !c)} loading={historyLoading} error={historyError} credits={credits} onBuy={() => setShowPaywall(true)} isMobile={isMobile} onFeedback={() => setShowFeedback(true)} hasMore={historyHasMore} loadingMore={loadingMoreHistory} onLoadMore={loadMoreHistory} />
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
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}
        <div className="flex flex-1 overflow-hidden relative">
          <HistorySidebar history={history} activeId={activeHistoryId} onSelect={(e) => { restoreEntry(e); if (isMobile) setHistorySidebarCollapsed(true); }} onNew={() => {}} onDelete={handleDeleteCourse} collapsed={historySidebarCollapsed} onToggle={() => setHistorySidebarCollapsed((c) => !c)} loading={historyLoading} error={historyError} credits={credits} onBuy={() => setShowPaywall(true)} isMobile={isMobile} onFeedback={() => setShowFeedback(true)} hasMore={historyHasMore} loadingMore={loadingMoreHistory} onLoadMore={loadMoreHistory} />
          {historySidebarCollapsed && <button onClick={() => setHistorySidebarCollapsed(false)} className="absolute left-0 top-4 z-10 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-r-lg text-slate-500 hover:text-slate-800 shadow-sm transition-all"><PanelLeft className="h-4 w-4" /></button>}
          <div className="flex-1 overflow-y-auto"><UploadPhase onGenerate={startNewCourse} credits={credits} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} courseId={activeHistoryId} courseName={fileName || undefined} />}
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}
      <Helmet><title>AI Learning Course | Level Up</title></Helmet>
      <div className="flex h-screen relative">
        <HistorySidebar history={history} activeId={activeHistoryId} onSelect={(e) => { restoreEntry(e); if (isMobile) setHistorySidebarCollapsed(true); }} onNew={() => setPhase("upload")} onDelete={handleDeleteCourse} collapsed={historySidebarCollapsed} onToggle={() => setHistorySidebarCollapsed((c) => !c)} loading={historyLoading} error={historyError} credits={credits} onBuy={() => setShowPaywall(true)} isMobile={isMobile} onFeedback={() => setShowFeedback(true)} hasMore={historyHasMore} loadingMore={loadingMoreHistory} onLoadMore={loadMoreHistory} />
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
                  onClick={() => { if (!isDisabled) { setActiveLesson(i); setActiveSection("video"); if (isMobile) setCourseSidebarOpen(false); } }}
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
                <VideoPlayer lesson={lessons[activeLesson]} onComplete={() => markComplete(lessons[activeLesson].id)} onRetry={() => handleRetryLesson(activeLesson)} retrying={retryingLesson === activeLesson} courseId={activeHistoryId} lessonNumber={activeLesson + 1} />
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button variant="outline" disabled={activeLesson === 0} onClick={() => setActiveLesson((i) => i - 1)} className="text-xs sm:text-sm px-3 sm:px-4 shrink-0"><ChevronLeft className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Previous</span></Button>
                  {activeHistoryId && lessonStatuses[activeLesson] === "ready" && lessons[activeLesson]?.code && (
                    <DownloadLessonButton
                      courseId={activeHistoryId}
                      lessonNumber={activeLesson + 1}
                      lessonTitle={lessons[activeLesson]?.title}
                    />
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
            {activeSection === "quiz" && <QuizSection questions={quizQuestions} onSubmit={(answers) => { setQuizAnswers(answers); setQuizDone(true); setActiveSection("results"); }} />}
            {activeSection === "results" && (
              <>
                <ResultsSection answers={quizAnswers} questions={quizQuestions} />
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