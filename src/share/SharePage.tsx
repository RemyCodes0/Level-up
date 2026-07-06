// pages/SharedCoursePage.tsx
// Route: /shared/:shareToken — completely public, no login required.
// Read-only viewer: watch every lesson, take the quiz, see results.
// No sidebar, no course history, no generation UI — just the content.

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, BookOpen,
  CheckCircle, ClipboardList, Trophy, Sparkles, ArrowRight,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mb-4" />
        <h1 className="text-lg font-semibold text-slate-800 mb-2">Can't load this course</h1>
        <p className="text-sm text-slate-500 mb-6 max-w-sm">{error}</p>
        <button onClick={() => navigate("/")} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">
          Go to Level Up
        </button>
      </div>
    );
  }

  const lesson = course.lessons[activeLesson];
  const score = quizSubmitted
    ? course.questions.filter((q) => answers[q.id] === q.correct).length
    : 0;
  const pct = course.questions.length ? Math.round((score / course.questions.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>{course.topic} — Shared Course | Level Up AI</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Header banner */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="Level Up" className="h-7 w-7 rounded-lg object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Shared course</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{course.topic}</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/signup")}
          className="shrink-0 flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Make your own <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Lesson tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 mb-5 -mx-1 px-1">
          {course.lessons.map((l, i) => (
            <button
              key={i}
              onClick={() => { setActiveLesson(i); setSection("video"); }}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: section === "video" && activeLesson === i ? "#2563eb" : "#fff",
                color: section === "video" && activeLesson === i ? "#fff" : "#64748b",
                border: "1px solid #e2e8f0",
              }}
            >
              {i + 1}. {l.title}
            </button>
          ))}
          {course.questions.length > 0 && (
            <button
              onClick={() => setSection("quiz")}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5"
              style={{
                backgroundColor: section === "quiz" || section === "results" ? "#2563eb" : "#fff",
                color: section === "quiz" || section === "results" ? "#fff" : "#64748b",
                border: "1px solid #e2e8f0",
              }}
            >
              <ClipboardList className="h-3 w-3" /> Quiz
            </button>
          )}
        </div>

        {/* Video */}
        {section === "video" && (
          <div className="space-y-4">
            {lesson.code ? (
              <DynamicPlayer code={lesson.code} durationInFrames={lesson.totalFrames ?? 3600} />
            ) : (
              <div className="rounded-xl bg-slate-900 aspect-video flex items-center justify-center text-white/60 text-sm">
                This lesson isn't available.
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-100 p-4 sm:p-5">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4 text-blue-600 shrink-0" /> Key points
              </h3>
              <ul className="space-y-2">
                {lesson.keyPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />{pt}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between">
              <button
                disabled={activeLesson === 0}
                onClick={() => setActiveLesson((i) => i - 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-500 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              {activeLesson < course.lessons.length - 1 ? (
                <button
                  onClick={() => setActiveLesson((i) => i + 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : course.questions.length > 0 ? (
                <button
                  onClick={() => setSection("quiz")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white"
                >
                  <ClipboardList className="h-4 w-4" /> Take the quiz
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Quiz */}
        {section === "quiz" && !quizSubmitted && (
          <div className="space-y-4">
            {course.questions.map((q) => (
              <div key={q.id} className="bg-white rounded-xl border border-slate-100 p-4 sm:p-5">
                <p className="text-xs font-semibold text-blue-600 mb-2">{q.topic}</p>
                <p className="text-sm font-medium text-slate-800 mb-3">{q.question}</p>
                <div className="space-y-2">
                  {q.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i }))}
                      className="w-full text-left p-3 rounded-lg border text-sm transition-all"
                      style={{
                        borderColor: answers[q.id] === i ? "#2563eb" : "#e2e8f0",
                        backgroundColor: answers[q.id] === i ? "#eff6ff" : "#fff",
                        color: answers[q.id] === i ? "#1e3a8a" : "#475569",
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={() => setQuizSubmitted(true)}
              disabled={Object.keys(answers).length < course.questions.length}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-emerald-500 text-white disabled:opacity-50"
            >
              Submit quiz
            </button>
          </div>
        )}

        {/* Results */}
        {(section === "quiz" && quizSubmitted) && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
            <Trophy className="h-8 w-8 text-amber-500 mx-auto mb-3" />
            <p className="text-4xl font-black text-slate-900 mb-1">{pct}%</p>
            <p className="text-sm text-slate-500 mb-6">{score} / {course.questions.length} correct</p>
            <div className="rounded-xl bg-blue-50 p-5">
              <Sparkles className="h-5 w-5 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800 mb-1">Want a course like this on your own topic?</p>
              <p className="text-xs text-slate-500 mb-4">Free first lesson, no card required.</p>
              <button
                onClick={() => navigate("/signup")}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
              >
                Start free
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}