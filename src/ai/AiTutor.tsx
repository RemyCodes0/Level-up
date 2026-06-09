"use client";

import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { Helmet } from "react-helmet-async";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Play,
  CheckCircle,
  Circle,
  Lock,
  Brain,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Clock,
  BarChart2,
  BookOpen,
  AlertCircle,
  Star,
  Award,
  TrendingUp,
  TrendingDown,
  User,
  ClipboardList,
  Trophy,
  X,
  Check,
  PanelLeft,
  PenSquare,
  GraduationCap,
  Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppPhase = "upload" | "generating" | "course";
type CourseSection = "video" | "quiz" | "results";
type LessonStatus = "ready" | "generating";

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
}

interface Lesson {
  id: number;
  title: string;
  duration: string;
  completed: boolean;
  description: string;
  keyPoints: string[];
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

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_LESSONS: Lesson[] = [
  {
    id: 1,
    title: "Introduction & Core Concepts",
    duration: "5:00",
    completed: false,
    description:
      "An overview of the foundational ideas in the subject, establishing the mental model you'll build on throughout the course.",
    keyPoints: [
      "What the subject covers and why it matters",
      "Key terminology and definitions",
      "How concepts relate to each other",
      "Setting up your study approach",
    ],
  },
  {
    id: 2,
    title: "Fundamental Principles",
    duration: "5:00",
    completed: false,
    description:
      "Deep dive into the core principles that govern the subject, with visual explanations and real-world analogies.",
    keyPoints: [
      "First principle: mechanism and application",
      "Second principle: common patterns",
      "How principles interact in practice",
      "Worked examples from your materials",
    ],
  },
  {
    id: 3,
    title: "Processes & Mechanisms",
    duration: "5:00",
    completed: false,
    description:
      "Step-by-step walkthrough of key processes, animated to show how each stage connects to the next.",
    keyPoints: [
      "Stage-by-stage process breakdown",
      "Inputs, outputs, and transformations",
      "Common failure points and exceptions",
      "Mnemonic devices for memorization",
    ],
  },
  {
    id: 4,
    title: "Analysis & Problem Solving",
    duration: "5:00",
    completed: false,
    description:
      "Applying your knowledge to analyze scenarios and solve problems—the skill that separates understanding from mastery.",
    keyPoints: [
      "Framework for approaching problems",
      "Worked problem set with explanations",
      "Common exam question patterns",
      "Checking and verifying your work",
    ],
  },
  {
    id: 5,
    title: "Advanced Applications",
    duration: "5:00",
    completed: false,
    description:
      "Exploring advanced use cases, edge cases, and the connections between this topic and related subjects.",
    keyPoints: [
      "Edge cases and special scenarios",
      "Connections to adjacent topics",
      "Research-level implications",
      "Real-world applications in the field",
    ],
  },
  {
    id: 6,
    title: "Synthesis & Exam Preparation",
    duration: "5:00",
    completed: false,
    description:
      "Bringing everything together: a comprehensive review, exam strategies, and a readiness check before your assessment.",
    keyPoints: [
      "Full concept map of the material",
      "Most frequently tested ideas",
      "Exam technique and time management",
      "What to review if time is short",
    ],
  },
];

const MOCK_QUESTIONS: MCQQuestion[] = [
  {
    id: 1,
    question: "Which of the following best describes the primary mechanism covered in Lesson 1?",
    options: [
      "A passive process driven by concentration gradients",
      "An active process requiring energy input",
      "A regulatory process controlled by feedback loops",
      "A structural process dependent on molecular geometry",
    ],
    correct: 2,
    topic: "Core Concepts",
  },
  {
    id: 2,
    question: "According to the fundamental principles discussed, what happens when the primary variable is increased?",
    options: [
      "The rate of the process decreases proportionally",
      "The system reaches equilibrium faster",
      "The output increases up to a saturation point",
      "No measurable change occurs below the threshold",
    ],
    correct: 2,
    topic: "Fundamental Principles",
  },
  {
    id: 3,
    question: "In the process breakdown from Lesson 3, which stage is rate-limiting?",
    options: [
      "The initiation stage",
      "The elongation stage",
      "The termination stage",
      "The regulation stage",
    ],
    correct: 1,
    topic: "Processes & Mechanisms",
  },
  {
    id: 4,
    question: "Which analogy was used to explain the core mechanism in Lesson 2?",
    options: [
      "A lock-and-key model",
      "An assembly line with checkpoints",
      "A river with dams and channels",
      "A network with nodes and edges",
    ],
    correct: 0,
    topic: "Fundamental Principles",
  },
  {
    id: 5,
    question: "When solving problems in this domain, what is the recommended first step?",
    options: [
      "Calculate the numerical answer immediately",
      "Identify knowns, unknowns, and constraints",
      "Consult reference tables for standard values",
      "Draw a diagram without labels first",
    ],
    correct: 1,
    topic: "Analysis & Problem Solving",
  },
  {
    id: 6,
    question: "An exception to the main principle occurs when:",
    options: [
      "Temperature exceeds the critical threshold",
      "Concentration drops below measurable levels",
      "Two competing processes occur simultaneously",
      "The system is isolated from external inputs",
    ],
    correct: 2,
    topic: "Advanced Applications",
  },
  {
    id: 7,
    question: "Which of the following is NOT a key point covered in the course materials?",
    options: [
      "The relationship between structure and function",
      "Economic modeling of the process",
      "Feedback regulation mechanisms",
      "The role of environmental factors",
    ],
    correct: 1,
    topic: "Core Concepts",
  },
  {
    id: 8,
    question: "The term 'threshold' in this context refers to:",
    options: [
      "The minimum input required to initiate the process",
      "The maximum output the system can produce",
      "The point at which the process becomes irreversible",
      "The optimal condition for peak efficiency",
    ],
    correct: 0,
    topic: "Fundamental Principles",
  },
  {
    id: 9,
    question: "From Lesson 3, how many distinct stages are in the core process?",
    options: ["2", "3", "4", "5"],
    correct: 2,
    topic: "Processes & Mechanisms",
  },
  {
    id: 10,
    question: "Which study strategy is recommended for memorizing the process stages?",
    options: [
      "Rote repetition of the textbook definition",
      "Creating acronym-based mnemonics",
      "Drawing the process from memory repeatedly",
      "Teaching the concept to a peer",
    ],
    correct: 2,
    topic: "Synthesis & Exam Prep",
  },
  {
    id: 11,
    question: "In a real-world application, the advanced scenario differs from the basic case because:",
    options: [
      "Multiple variables interact non-linearly",
      "The process reverses direction",
      "Energy requirements are eliminated",
      "External regulation becomes unnecessary",
    ],
    correct: 0,
    topic: "Advanced Applications",
  },
  {
    id: 12,
    question: "According to the synthesis lesson, which concept is most frequently tested in exams?",
    options: [
      "The historical development of the field",
      "Quantitative problem-solving with formulas",
      "Identifying stages and their functions",
      "Comparing competing theoretical models",
    ],
    correct: 2,
    topic: "Synthesis & Exam Prep",
  },
  {
    id: 13,
    question: "What does the concept map from Lesson 6 show as the central node?",
    options: [
      "The output/product of the process",
      "The regulatory mechanism",
      "The core principle connecting all topics",
      "The environmental context",
    ],
    correct: 2,
    topic: "Synthesis & Exam Prep",
  },
  {
    id: 14,
    question: "When two variables interact, the combined effect is best described as:",
    options: [
      "Always additive — the sum of individual effects",
      "Always multiplicative — exponential growth",
      "Context-dependent — sometimes synergistic, sometimes antagonistic",
      "Always canceling — they neutralize each other",
    ],
    correct: 2,
    topic: "Advanced Applications",
  },
  {
    id: 15,
    question: "The problem-solving framework from Lesson 4 has how many steps?",
    options: ["3", "4", "5", "6"],
    correct: 1,
    topic: "Analysis & Problem Solving",
  },
  {
    id: 16,
    question: "Which of the following correctly describes a feedback loop in this context?",
    options: [
      "Output is continuously removed from the system",
      "Output signals the system to adjust its own rate",
      "Input is doubled at regular intervals",
      "The process runs independently of its own output",
    ],
    correct: 1,
    topic: "Processes & Mechanisms",
  },
  {
    id: 17,
    question: "According to the course materials, which factor has the greatest influence on process efficiency?",
    options: [
      "Time available for the process",
      "Concentration of the primary substrate",
      "Temperature within the optimal range",
      "Presence of regulatory molecules",
    ],
    correct: 3,
    topic: "Fundamental Principles",
  },
  {
    id: 18,
    question: "An exam question asks you to 'compare and contrast' two related processes. Your best approach is to:",
    options: [
      "List all features of Process A, then all features of Process B",
      "Describe only the differences, ignoring similarities",
      "Use a structured framework: shared features, unique features, implications",
      "Focus on whichever process you know better",
    ],
    correct: 2,
    topic: "Synthesis & Exam Prep",
  },
  {
    id: 19,
    question: "The connection between this subject and adjacent fields (Lesson 5) is primarily through:",
    options: [
      "Shared mathematical formulations",
      "Common regulatory principles",
      "Identical experimental techniques",
      "Overlapping historical development",
    ],
    correct: 1,
    topic: "Advanced Applications",
  },
  {
    id: 20,
    question: "If you have 30 minutes before an exam on this material, you should prioritize reviewing:",
    options: [
      "Your original lecture notes from the beginning of the semester",
      "The process stages, key definitions, and worked examples",
      "Advanced applications and edge cases",
      "The historical background and context",
    ],
    correct: 1,
    topic: "Synthesis & Exam Prep",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function UploadPhase({ onGenerate }: { onGenerate: (fileName: string) => void }) {
  const [inputValue, setInputValue] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFile = (file: File) => {
    if (file.type === "application/pdf" || file.name.endsWith(".pptx")) {
      setUploadedFile(file);
    }
  };

  const handleSubmit = () => {
    if (!uploadedFile && !inputValue.trim()) return;
    const name = uploadedFile ? uploadedFile.name : `${inputValue.trim().slice(0, 40)}.pdf`;
    onGenerate(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [inputValue]);

  const canSubmit = !!uploadedFile || inputValue.trim().length > 0;

  const suggestions = [
    "BIOL 201 — Cell Biology lecture slides",
    "MATH 201 — Calculus II integration techniques",
    "CMPS 303 — Data structures & algorithms",
    "PHYS 201 — Electromagnetic waves",
  ];

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 pb-8">
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            What would you like to learn?
          </h1>
          <p className="text-muted-foreground text-base">
            Describe your topic or upload your course materials — AI generates your full course.
          </p>
        </div>

        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
            {uploadedFile && (
              <div className="px-4 pt-3">
                <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-blue-800 font-medium max-w-[260px] truncate">{uploadedFile.name}</span>
                  <span className="text-blue-400 text-xs">
                    {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="text-blue-400 hover:text-blue-700 ml-1 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 pt-3 pb-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. BIOL 201 — DNA replication and cell division…"
                rows={1}
                className="w-full resize-none bg-transparent text-slate-800 placeholder:text-slate-400 text-base focus:outline-none leading-relaxed"
                style={{ minHeight: "40px", maxHeight: "160px" }}
              />
            </div>

            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <div className="flex items-center gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.pptx"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                  title="Attach PDF or PPTX"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </button>
                <span className="text-xs text-slate-400 ml-1">PDF or PPTX</span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  canSubmit
                    ? "bg-slate-900 text-white hover:bg-slate-700"
                    : "bg-slate-100 text-slate-300 cursor-not-allowed"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInputValue(s)}
                className="text-xs text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1.5 hover:border-slate-400 hover:text-slate-700 transition-all shadow-sm"
              >
                {s}
              </button>
            ))}
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            Lesson 1 ready in seconds · remaining lessons load while you watch
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Generating Phase — only lesson 1 ─────────────────────────────────────────

function GeneratingPhase({ fileName, onDone }: { fileName: string; onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const steps = [
    "Parsing your course materials…",
    "Structuring your learning path…",
    "Generating Lesson 1 content…",
    "Building your first video…",
    "Almost ready…",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 3.5;
        if (next >= 100) {
          clearInterval(interval);
          onDone();
          return 100;
        }
        setStepIndex(Math.min(Math.floor(next / 20), steps.length - 1));
        return next;
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-6">
          <Brain className="h-10 w-10 text-blue-600 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Building Your First Lesson</h2>
        <p className="text-muted-foreground mb-2 text-sm">{fileName}</p>
        <p className="text-blue-600 font-medium mb-6 h-6 transition-all">{steps[stepIndex]}</p>
        <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-150"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mb-3">{Math.min(Math.round(progress), 100)}% complete</p>
        <p className="text-xs text-slate-400">
          Remaining lessons will load in the background while you watch
        </p>
      </div>
    </div>
  );
}

// ─── Video Player ─────────────────────────────────────────────────────────────

function VideoPlayer({
  lesson,
  onComplete,
}: {
  lesson: Lesson;
  onComplete: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const totalSeconds = 300;

  useEffect(() => {
    setPlaying(false);
    setElapsed(0);
  }, [lesson.id]);

  useEffect(() => {
    if (!playing) return;
    if (elapsed >= totalSeconds) { onComplete(); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [playing, elapsed]);

  const pct = (elapsed / totalSeconds) * 100;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center group">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-8 left-8 w-32 h-32 rounded-full bg-blue-400 blur-3xl animate-pulse" />
          <div className="absolute bottom-8 right-8 w-24 h-24 rounded-full bg-indigo-400 blur-2xl animate-pulse" style={{ animationDelay: "0.5s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-purple-400 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        </div>

        <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-blue-400" />
          <span className="text-xs text-white font-medium">AI Generated</span>
        </div>

        <button
          onClick={() => setPlaying((p) => !p)}
          className="relative z-10 w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-all hover:scale-105"
        >
          {playing ? (
            <div className="flex gap-1.5">
              <div className="w-1.5 h-6 bg-white rounded-sm" />
              <div className="w-1.5 h-6 bg-white rounded-sm" />
            </div>
          ) : (
            <Play className="h-7 w-7 text-white fill-white ml-1" />
          )}
        </button>

        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-white font-semibold text-lg drop-shadow">{lesson.title}</p>
          <p className="text-white/70 text-sm">{lesson.description.slice(0, 80)}…</p>
        </div>

        <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1">
          <Clock className="h-3 w-3 text-white/70" />
          <span className="text-xs text-white/90">{lesson.duration}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div
          className="w-full bg-slate-200 rounded-full h-1.5 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            setElapsed(Math.round(ratio * totalSeconds));
          }}
        >
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{fmt(elapsed)}</span>
          <span>{lesson.duration}</span>
        </div>
      </div>

      <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-5">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600" />
          Key points in this lesson
        </h3>
        <ul className="space-y-2">
          {lesson.keyPoints.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              {pt}
            </li>
          ))}
        </ul>
      </Card>

      {elapsed >= totalSeconds && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-emerald-800">Lesson complete!</p>
            <p className="text-sm text-emerald-600">Move to the next lesson or take the quiz when ready.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quiz Section ─────────────────────────────────────────────────────────────

function QuizSection({
  questions,
  onSubmit,
}: {
  questions: MCQQuestion[];
  onSubmit: (answers: QuizAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [submitted, timeLeft]);

  const answered = (id: number) => answers.find((a) => a.questionId === id);
  const select = (qId: number, opt: number) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionId === qId);
      if (existing >= 0) {
        const n = [...prev];
        n[existing] = { questionId: qId, selected: opt };
        return n;
      }
      return [...prev, { questionId: qId, selected: opt }];
    });
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const q = questions[currentQ];

  const handleSubmit = () => {
    setSubmitted(true);
    onSubmit(answers);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-purple-600" />
            Learning Assessment
          </h2>
          <p className="text-sm text-muted-foreground">
            {answers.length} of {questions.length} answered
          </p>
        </div>
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold text-sm ${
            timeLeft < 300 ? "bg-red-50 text-red-600 border border-red-200" : "bg-slate-100 text-slate-700"
          }`}
        >
          <Clock className="h-4 w-4" />
          {fmt(timeLeft)}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setCurrentQ(i)}
            className={`w-7 h-7 rounded-md text-xs font-semibold transition-all ${
              i === currentQ
                ? "bg-blue-600 text-white shadow-sm"
                : answered(q.id)
                ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <Card className="border-0 shadow-lg bg-white/90 backdrop-blur p-6">
        <div className="flex items-center justify-between mb-4">
          <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
            {q.topic}
          </Badge>
          <span className="text-sm text-muted-foreground font-medium">
            Q{currentQ + 1} / {questions.length}
          </span>
        </div>

        <p className="text-base font-medium text-slate-900 mb-5 leading-relaxed">{q.question}</p>

        <div className="space-y-3">
          {q.options.map((opt, i) => {
            const sel = answered(q.id)?.selected === i;
            return (
              <button
                key={i}
                onClick={() => select(q.id, i)}
                className={`w-full text-left p-4 rounded-xl border text-sm transition-all ${
                  sel
                    ? "border-blue-500 bg-blue-50 text-blue-900 font-medium"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <span className={`inline-flex w-6 h-6 rounded-full border text-xs items-center justify-center mr-3 font-semibold ${
                  sel ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-slate-500"
                }`}>
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
          disabled={currentQ === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>

        {currentQ < questions.length - 1 ? (
          <Button
            onClick={() => setCurrentQ((q) => Math.min(questions.length - 1, q + 1))}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
            disabled={answers.length < questions.length}
          >
            <Trophy className="h-4 w-4 mr-2" />
            Submit Assessment
          </Button>
        )}
      </div>

      {answers.length < questions.length && currentQ === questions.length - 1 && (
        <p className="text-center text-xs text-amber-600">
          {questions.length - answers.length} question{questions.length - answers.length !== 1 ? "s" : ""} still unanswered
        </p>
      )}
    </div>
  );
}

// ─── Results Section ──────────────────────────────────────────────────────────

function ResultsSection({ answers, questions }: { answers: QuizAnswer[]; questions: MCQQuestion[] }) {
  const score = answers.filter((a) => {
    const q = questions.find((q) => q.id === a.questionId);
    return q && q.correct === a.selected;
  }).length;

  const pct = Math.round((score / questions.length) * 100);

  const topicBreakdown = questions.reduce<Record<string, { correct: number; total: number }>>((acc, q) => {
    const ans = answers.find((a) => a.questionId === q.id);
    if (!acc[q.topic]) acc[q.topic] = { correct: 0, total: 0 };
    acc[q.topic].total++;
    if (ans && ans.selected === q.correct) acc[q.topic].correct++;
    return acc;
  }, {});

  const topics = Object.entries(topicBreakdown)
    .map(([topic, data]) => ({ topic, ...data, pct: Math.round((data.correct / data.total) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  const strengths = topics.filter((t) => t.pct >= 70);
  const weaknesses = topics.filter((t) => t.pct < 70);

  const readinessLabel =
    pct >= 85 ? "Exam Ready" : pct >= 70 ? "Almost Ready" : pct >= 55 ? "Needs Review" : "Needs Tutoring";
  const readinessColor =
    pct >= 85 ? "emerald" : pct >= 70 ? "blue" : pct >= 55 ? "amber" : "red";

  const recommendedTutors = weaknesses.map((w) => ({
    topic: w.topic,
    name: ["Nour A.", "Karim B.", "Layla M.", "Omar T.", "Sara K."][Math.floor(Math.random() * 5)],
    rating: (4 + Math.random()).toFixed(1),
    rate: `$${10 + Math.floor(Math.random() * 8)}/hr`,
  }));

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg bg-white/90 backdrop-blur overflow-hidden">
        <div className={`bg-${readinessColor}-50 border-b border-${readinessColor}-100 p-6`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Award className={`h-6 w-6 text-${readinessColor}-600`} />
                Your Learning Readiness Score
              </h2>
              <p className="text-muted-foreground mt-1">
                {score} / {questions.length} correct
              </p>
            </div>
            <div className="text-center">
              <div className={`text-5xl font-black text-${readinessColor}-600`}>{pct}%</div>
              <Badge className={`bg-${readinessColor}-100 text-${readinessColor}-700 border-${readinessColor}-200 mt-1`}>
                {readinessLabel}
              </Badge>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-white/60 rounded-full h-3">
              <div
                className={`bg-${readinessColor}-500 h-3 rounded-full transition-all duration-1000`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-slate-500" /> Topic breakdown
          </h3>
          <div className="space-y-3">
            {topics.map(({ topic, pct: tPct, correct, total }) => (
              <div key={topic}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 font-medium">{topic}</span>
                  <span className={`font-semibold ${tPct >= 70 ? "text-emerald-600" : "text-red-500"}`}>
                    {correct}/{total} · {tPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${tPct >= 70 ? "bg-emerald-500" : "bg-red-400"}`}
                    style={{ width: `${tPct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-5">
          <h3 className="font-semibold text-emerald-700 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Strengths
          </h3>
          {strengths.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keep studying — strengths will emerge!</p>
          ) : (
            <ul className="space-y-2">
              {strengths.map(({ topic, pct: tPct }) => (
                <li key={topic} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    {topic}
                  </span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">{tPct}%</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-5">
          <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> Needs review
          </h3>
          {weaknesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Excellent — no weak areas detected!</p>
          ) : (
            <ul className="space-y-2">
              {weaknesses.map(({ topic, pct: tPct }) => (
                <li key={topic} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                    {topic}
                  </span>
                  <Badge className="bg-red-50 text-red-600 border-red-200 text-xs">{tPct}%</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {recommendedTutors.length > 0 && (
        <Card className="border-0 shadow-md bg-white/80 backdrop-blur p-5">
          <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            Recommended Tutors
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Based on your weak areas, these peer tutors can help you level up.
          </p>
          <div className="space-y-3">
            {recommendedTutors.slice(0, 3).map((t, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.topic} specialist</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-amber-600 flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{t.rating}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.rate}</p>
                  </div>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                    Book
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── History Sidebar ──────────────────────────────────────────────────────────

function HistorySidebar({
  history,
  activeId,
  onSelect,
  onNew,
  collapsed,
  onToggle,
}: {
  history: HistoryEntry[];
  activeId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const groups = history.reduce<Record<string, HistoryEntry[]>>((acc, e) => {
    const now = new Date();
    const d = e.createdAt;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    let label = "Today";
    if (diffDays === 1) label = "Yesterday";
    else if (diffDays <= 7) label = "Previous 7 days";
    else if (diffDays <= 30) label = "Previous 30 days";
    else label = d.toLocaleString("default", { month: "long", year: "numeric" });
    if (!acc[label]) acc[label] = [];
    acc[label].push(e);
    return acc;
  }, {});

  const groupOrder = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days"];
  const sortedGroups = [
    ...groupOrder.filter((g) => groups[g]),
    ...Object.keys(groups).filter((g) => !groupOrder.includes(g)),
  ];

  return (
    <aside
      className={`${
        collapsed ? "w-0" : "w-64"
      } transition-all duration-300 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden`}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
        <button
          onClick={onToggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
          title="Toggle sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onNew}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
          title="New course"
        >
          <PenSquare className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {history.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <GraduationCap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No courses yet.</p>
            <p className="text-xs text-slate-400 mt-0.5">Generate one to get started.</p>
          </div>
        ) : (
          sortedGroups.map((group) => (
            <div key={group} className="mb-1">
              <p className="px-3 py-1.5 text-xs font-semibold text-slate-400">{group}</p>
              {groups[group].map((entry) => {
                const isActive = entry.id === activeId;
                const pct = Math.round((entry.completedLessons / MOCK_LESSONS.length) * 100);
                return (
                  <button
                    key={entry.id}
                    onClick={() => onSelect(entry)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg mx-1 transition-all group relative ${
                      isActive
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                    style={{ width: "calc(100% - 8px)" }}
                  >
                    <p className="text-xs font-medium leading-snug line-clamp-1 pr-2">
                      {entry.fileName.replace(/\.(pdf|pptx)$/i, "")}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 bg-slate-200 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-blue-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {entry.quizScore !== null ? (
                        <span className="text-xs font-semibold text-emerald-600 shrink-0">
                          {entry.quizScore}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 shrink-0">{pct}%</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

// ─── Lesson Status Indicator ──────────────────────────────────────────────────

function LessonStatusIcon({
  status,
  completed,
  isActive,
  isLocked,
}: {
  status: LessonStatus;
  completed: boolean;
  isActive: boolean;
  isLocked: boolean;
}) {
  if (completed) return <CheckCircle className="h-4 w-4 text-emerald-500" />;
  if (status === "generating") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
  if (isLocked) return <Lock className="h-4 w-4 text-slate-300" />;
  if (isActive) return <Play className="h-4 w-4 text-blue-600 fill-blue-600" />;
  return <Circle className="h-4 w-4 text-slate-300" />;
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function AILearningPage() {
  const [phase, setPhase] = useState<AppPhase>("upload");
  const [fileName, setFileName] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>(MOCK_LESSONS);
  // Track per-lesson generation status: lesson 0 starts ready, rest start generating
  const [lessonStatuses, setLessonStatuses] = useState<LessonStatus[]>(
    MOCK_LESSONS.map((_, i) => (i === 0 ? "ready" : "generating"))
  );
  const [activeSection, setActiveSection] = useState<CourseSection>("video");
  const [activeLesson, setActiveLesson] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [quizDone, setQuizDone] = useState(false);
  const [courseSidebarOpen, setCourseSidebarOpen] = useState(true);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(false);

  // Refs to hold background generation timers so they can be cleared on new course
  const bgTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const markComplete = (lessonId: number) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, completed: true } : l))
    );
  };

  // Keep history entry in sync as user progresses
  useEffect(() => {
    if (!activeHistoryId) return;
    setHistory((prev) =>
      prev.map((e) =>
        e.id === activeHistoryId
          ? {
              ...e,
              lessons,
              lessonStatuses,
              completedLessons: lessons.filter((l) => l.completed).length,
              quizAnswers,
              quizDone,
              quizScore: quizDone
                ? Math.round(
                    (quizAnswers.filter((a) => {
                      const q = MOCK_QUESTIONS.find((q) => q.id === a.questionId);
                      return q && q.correct === a.selected;
                    }).length /
                      MOCK_QUESTIONS.length) *
                      100
                  )
                : null,
            }
          : e
      )
    );
  }, [lessons, lessonStatuses, quizAnswers, quizDone]);

  const startNewCourse = (name: string) => {
    // Clear any running background timers from previous course
    bgTimersRef.current.forEach(clearTimeout);
    bgTimersRef.current = [];

    const freshLessons = MOCK_LESSONS.map((l) => ({ ...l, completed: false }));
    // Lesson 1 is immediately ready; 2-6 are still generating
    const freshStatuses: LessonStatus[] = freshLessons.map((_, i) =>
      i === 0 ? "ready" : "generating"
    );

    const entry: HistoryEntry = {
      id: `${Date.now()}`,
      fileName: name,
      createdAt: new Date(),
      completedLessons: 0,
      quizScore: null,
      lessons: freshLessons,
      lessonStatuses: freshStatuses,
      quizAnswers: [],
      quizDone: false,
    };

    setHistory((prev) => [entry, ...prev]);
    setActiveHistoryId(entry.id);
    setFileName(name);
    setLessons(freshLessons);
    setLessonStatuses(freshStatuses);
    setActiveSection("video");
    setActiveLesson(0);
    setQuizAnswers([]);
    setQuizDone(false);
    setPhase("generating");

    // Stagger background generation: each lesson becomes ready ~12s apart
    // In production, replace these with real API completion callbacks
    freshLessons.forEach((_, i) => {
      if (i === 0) return; // already ready
      const timer = setTimeout(() => {
        setLessonStatuses((prev) => {
          const next = [...prev];
          next[i] = "ready";
          return next;
        });
      }, i * 12000);
      bgTimersRef.current.push(timer);
    });
  };

  const restoreEntry = (entry: HistoryEntry) => {
    setActiveHistoryId(entry.id);
    setFileName(entry.fileName);
    setLessons(entry.lessons);
    setLessonStatuses(entry.lessonStatuses ?? entry.lessons.map(() => "ready" as LessonStatus));
    setQuizAnswers(entry.quizAnswers);
    setQuizDone(entry.quizDone);
    setActiveSection(entry.quizDone ? "results" : "video");
    setActiveLesson(0);
    setPhase("course");
  };

  const allLessonsReady = lessonStatuses.every((s) => s === "ready");
  const allComplete = lessons.every((l) => l.completed);
  const completedCount = lessons.filter((l) => l.completed).length;

  if (phase === "generating") {
    return <GeneratingPhase fileName={fileName} onDone={() => setPhase("course")} />;
  }

  if (phase === "upload") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex flex-col">
        <Navbar />
        <div className="flex flex-1 overflow-hidden relative">
          <HistorySidebar
            history={history}
            activeId={activeHistoryId}
            onSelect={restoreEntry}
            onNew={() => {}}
            collapsed={historySidebarCollapsed}
            onToggle={() => setHistorySidebarCollapsed((c) => !c)}
          />
          {historySidebarCollapsed && (
            <button
              onClick={() => setHistorySidebarCollapsed(false)}
              className="absolute left-0 top-4 z-10 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-r-lg text-slate-500 hover:text-slate-800 shadow-sm transition-all"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1 overflow-y-auto">
            <UploadPhase onGenerate={startNewCourse} />
          </div>
        </div>
      </div>
    );
  }

  // ── Course view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <Helmet>
        <title>AI Learning Course | Level Up</title>
      </Helmet>
      <Navbar />

      <div className="flex h-[calc(100vh-64px)] relative">

        {/* ── History sidebar (leftmost) ── */}
        <HistorySidebar
          history={history}
          activeId={activeHistoryId}
          onSelect={restoreEntry}
          onNew={() => setPhase("upload")}
          collapsed={historySidebarCollapsed}
          onToggle={() => setHistorySidebarCollapsed((c) => !c)}
        />

        {historySidebarCollapsed && (
          <button
            onClick={() => setHistorySidebarCollapsed(false)}
            className="absolute left-0 top-4 z-10 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-r-lg text-slate-500 hover:text-slate-800 shadow-sm transition-all"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}

        {/* ── Course sidebar (second) ── */}
        <aside
          className={`${
            courseSidebarOpen ? "w-72" : "w-0 overflow-hidden"
          } transition-all duration-300 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm`}
        >
          {/* Course info header */}
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">AI Course</span>
            </div>
            <h2 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">{fileName}</h2>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / lessons.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{completedCount}/{lessons.length}</span>
            </div>

            {/* Background generation progress indicator */}
            {!allLessonsReady && (
              <div className="mt-3 flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                <p className="text-xs text-blue-700">
                  {lessonStatuses.filter((s) => s === "generating").length} lesson
                  {lessonStatuses.filter((s) => s === "generating").length !== 1 ? "s" : ""} generating…
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3">
            <div className="px-4 mb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Video Lessons</p>
            </div>

            {lessons.map((lesson, i) => {
              const status = lessonStatuses[i];
              const isStillGenerating = status === "generating";
              // A lesson is locked if still generating OR previous lesson not complete (and not lesson 0)
              const isLocked = isStillGenerating || (i > 0 && !lessons[i - 1].completed);
              const isActive = activeSection === "video" && activeLesson === i;

              return (
                <button
                  key={lesson.id}
                  disabled={isLocked}
                  onClick={() => {
                    if (!isLocked) {
                      setActiveLesson(i);
                      setActiveSection("video");
                    }
                  }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all group ${
                    isActive
                      ? "bg-blue-50 border-r-2 border-blue-600"
                      : isLocked
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <LessonStatusIcon
                      status={status}
                      completed={lesson.completed}
                      isActive={isActive}
                      isLocked={isLocked}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate ${isActive ? "text-blue-700" : "text-slate-700"}`}>
                      {i + 1}. {lesson.title}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" /> {lesson.duration}
                      {isStillGenerating && (
                        <span className="text-blue-400 ml-1">· generating…</span>
                      )}
                    </p>
                  </div>
                </button>
              );
            })}

            {/* Assessment section */}
            <div className="px-4 mt-4 mb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Assessment</p>
            </div>

            <button
              disabled={!allComplete}
              onClick={() => allComplete && setActiveSection("quiz")}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all ${
                activeSection === "quiz"
                  ? "bg-purple-50 border-r-2 border-purple-600"
                  : !allComplete
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-slate-50"
              }`}
            >
              <ClipboardList className={`h-4 w-4 mt-0.5 ${activeSection === "quiz" ? "text-purple-600" : quizDone ? "text-emerald-500" : "text-slate-400"}`} />
              <div>
                <p className={`text-xs font-semibold ${activeSection === "quiz" ? "text-purple-700" : "text-slate-700"}`}>
                  Final Quiz
                </p>
                <p className="text-xs text-muted-foreground">20 questions</p>
              </div>
              {!allComplete && <Lock className="h-3 w-3 text-slate-300 ml-auto mt-1" />}
            </button>

            <button
              disabled={!quizDone}
              onClick={() => quizDone && setActiveSection("results")}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all ${
                activeSection === "results"
                  ? "bg-amber-50 border-r-2 border-amber-500"
                  : !quizDone
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-slate-50"
              }`}
            >
              <Trophy className={`h-4 w-4 mt-0.5 ${activeSection === "results" ? "text-amber-600" : quizDone ? "text-amber-500" : "text-slate-400"}`} />
              <div>
                <p className={`text-xs font-semibold ${activeSection === "results" ? "text-amber-700" : "text-slate-700"}`}>
                  Results & Recommendations
                </p>
                <p className="text-xs text-muted-foreground">Readiness score</p>
              </div>
              {!quizDone && <Lock className="h-3 w-3 text-slate-300 ml-auto mt-1" />}
            </button>
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <button
              onClick={() => setCourseSidebarOpen((o) => !o)}
              className="mb-4 text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              {courseSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {courseSidebarOpen ? "Hide" : "Show"} course nav
            </button>

            {activeSection === "video" && (
              <div className="space-y-6">
                <VideoPlayer
                  lesson={lessons[activeLesson]}
                  onComplete={() => markComplete(lessons[activeLesson].id)}
                />

                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    disabled={activeLesson === 0}
                    onClick={() => setActiveLesson((i) => i - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>

                  {activeLesson < lessons.length - 1 ? (
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={!lessons[activeLesson].completed || lessonStatuses[activeLesson + 1] === "generating"}
                        onClick={() => {
                          markComplete(lessons[activeLesson].id);
                          setActiveLesson((i) => i + 1);
                        }}
                      >
                        {lessonStatuses[activeLesson + 1] === "generating" ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Next lesson generating…
                          </>
                        ) : (
                          <>
                            Next Lesson <ChevronRight className="h-4 w-4 ml-1" />
                          </>
                        )}
                      </Button>
                      {lessonStatuses[activeLesson + 1] === "generating" && lessons[activeLesson].completed && (
                        <p className="text-xs text-blue-500">Next lesson will be ready shortly</p>
                      )}
                    </div>
                  ) : (
                    <Button
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                      disabled={!allComplete}
                      onClick={() => setActiveSection("quiz")}
                    >
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Take the Quiz
                    </Button>
                  )}
                </div>

                {!lessons[activeLesson].completed && (
                  <p className="text-center text-xs text-muted-foreground">
                    Watch the video to completion to unlock the next lesson
                  </p>
                )}
              </div>
            )}

            {activeSection === "quiz" && (
              <QuizSection
                questions={MOCK_QUESTIONS}
                onSubmit={(answers) => {
                  setQuizAnswers(answers);
                  setQuizDone(true);
                  setActiveSection("results");
                }}
              />
            )}

            {activeSection === "results" && (
              <ResultsSection answers={quizAnswers} questions={MOCK_QUESTIONS} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}