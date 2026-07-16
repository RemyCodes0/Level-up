"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Navbar } from "@/components/navbar/Navbar";
import { PageMeta } from "@/components/PageMeta";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2, Circle,
  ClipboardList, Trophy, Users, TrendingUp, TrendingDown, Copy, Check,
  Sparkles, RotateCcw, BarChart2, Award, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import { DynamicPlayer } from "@/remotion/DynamicPlayer";
import { getRoom, getDashboard } from "@/api/CollabApi";
import type { RoomDashboard } from "@/api/CollabApi";
import { getProgress, markLessonWatched, logSceneReplay } from "@/api/ProgressApi";
import type { CourseProgress } from "@/api/ProgressApi";
import { submitQuiz, getLatestAttempt } from "@/api/QuizApi";
import type { QuizResult } from "@/api/QuizApi";
import { getNextSuggestions } from "@/api/CourseApi";
import type { NextCourseSuggestion } from "@/api/CourseApi";

type Tab = "watch" | "quiz" | "dashboard";

export default function CollabRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
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
      // Keep polling while the shared course (or a just-appended remedial
      // lesson) is still generating — same interval-polling pattern the
      // solo-course flow already uses (pollCourse in CourseApi.ts); this app
      // has no push infra to do better than that.
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-slate-600">{error || "Study group not found"}</p>
      </div>
    );
  }

  const course = room.courseId;
  const lesson = course.lessons?.[activeLesson];
  const isWatched = (lessonNumber: number) => !!progress?.lessons.find((l) => l.lessonNumber === lessonNumber)?.watched;

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta title={`${room.name} | Level Up AI`} noindex />
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <RoomHeader room={room} />

        <div className="flex gap-1.5 border-b border-slate-200 mb-6 mt-6 overflow-x-auto">
          {([
            ["watch", "Watch", ChevronRight],
            ["quiz", "Quiz", ClipboardList],
            ["dashboard", "Group Dashboard", Users],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "watch" && (
          <WatchTab
            course={course}
            activeLesson={activeLesson}
            setActiveLesson={setActiveLesson}
            isWatched={isWatched}
            onEnded={handleLessonEnded}
            onSeekBack={handleSeekBack}
          />
        )}
        {tab === "quiz" && <QuizTab course={course} roomId={room._id} />}
        {tab === "dashboard" && <DashboardTab roomId={room._id} />}
      </div>
    </div>
  );
}

// ─── Header: name, invite code, member avatars ──────────────────────────────

function RoomHeader({ room }: { room: any }) {
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard.writeText(room.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs text-slate-400 mb-1">Study Group</p>
        <h1 className="text-2xl font-bold text-slate-900">{room.name}</h1>
        <p className="text-sm text-slate-500 mt-1">{room.courseId?.topic}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center -space-x-2">
          {room.participants.slice(0, 5).map((p: any) => (
            <div
              key={p.userId._id || p.userId}
              title={p.userId.name}
              className="h-8 w-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-xs font-semibold text-blue-700"
            >
              {(p.userId.name || "?")[0]?.toUpperCase()}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={copyCode} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {room.inviteCode}
        </Button>
      </div>
    </div>
  );
}

// ─── Watch tab ───────────────────────────────────────────────────────────────

function WatchTab({
  course, activeLesson, setActiveLesson, isWatched, onEnded, onSeekBack,
}: {
  course: any;
  activeLesson: number;
  setActiveLesson: (i: number) => void;
  isWatched: (n: number) => boolean;
  onEnded: () => void;
  onSeekBack: (frame: number) => void;
}) {
  const lesson = course.lessons?.[activeLesson];

  return (
    <div className="grid lg:grid-cols-[1fr,280px] gap-6">
      <div>
        {lesson?.status === "ready" && lesson.code ? (
          <DynamicPlayer
            key={lesson.lessonNumber}
            code={lesson.code}
            durationInFrames={lesson.totalFrames ?? 3600}
            onEnded={onEnded}
            onSeekBack={onSeekBack}
          />
        ) : (
          <div className="rounded-xl bg-slate-900 aspect-video flex flex-col items-center justify-center text-white/70 gap-3">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">{lesson?.status === "failed" ? "This lesson failed to generate." : "Generating this lesson…"}</p>
          </div>
        )}
        {lesson && (
          <div className="bg-white rounded-xl border border-slate-100 p-4 sm:p-5 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-semibold text-slate-900">{lesson.title}</h2>
              {lesson.isRemedial && (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                  <Sparkles className="h-3 w-3 mr-1" /> Remedial · added for the group
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-600">{lesson.description}</p>
          </div>
        )}
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" disabled={activeLesson === 0} onClick={() => setActiveLesson(activeLesson - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <Button disabled={activeLesson >= course.lessons.length - 1} onClick={() => setActiveLesson(activeLesson + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <aside className="space-y-1.5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Lessons</p>
        {course.lessons.map((l: any, i: number) => (
          <button
            key={l.lessonNumber}
            onClick={() => setActiveLesson(i)}
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-sm transition-colors ${
              i === activeLesson ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-700"
            }`}
          >
            {isWatched(l.lessonNumber) ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-slate-300 shrink-0" />
            )}
            <span className="truncate flex-1">{l.title}</span>
            {l.isRemedial && <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          </button>
        ))}
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

  useEffect(() => {
    getLatestAttempt(course._id)
      .then((r) => { if (r) setResult(r); })
      .finally(() => setLoadingExisting(false));
  }, [course._id]);

  if (loadingExisting) {
    return <div className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></div>;
  }

  if (!course.questions?.length) {
    return <p className="text-sm text-slate-500 text-center py-16">This course doesn't have a quiz yet.</p>;
  }

  if (result) {
    return <QuizResultsView result={result} courseId={course._id} onRetake={() => setResult(null)} />;
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

  return (
    <div className="space-y-4 max-w-2xl">
      {course.questions.map((q: any) => (
        <Card key={q.id} className="p-4 sm:p-5">
          <p className="text-xs font-semibold text-blue-600 mb-2">{q.topic}</p>
          <p className="text-sm font-medium text-slate-800 mb-3">{q.question}</p>
          <div className="space-y-2">
            {q.options.map((opt: string, i: number) => (
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
        </Card>
      ))}
      {error && <p className="text-sm text-red-500 flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> {error}</p>}
      <Button
        className="w-full"
        disabled={Object.keys(answers).length < course.questions.length || submitting}
        onClick={submit}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Submit quiz
      </Button>
    </div>
  );
}

function QuizResultsView({ result, courseId, onRetake }: { result: QuizResult; courseId: string; onRetake: () => void }) {
  const [suggestions, setSuggestions] = useState<NextCourseSuggestion[] | null>(null);
  const readinessColor =
    result.pct >= 85 ? "emerald" : result.pct >= 70 ? "blue" : result.pct >= 55 ? "amber" : "red";
  const strengths = result.topicBreakdown.filter((t) => t.pct >= 70);
  const weaknesses = result.topicBreakdown.filter((t) => t.pct < 70);

  return (
    <div className="space-y-5 max-w-2xl">
      <Card className="overflow-hidden">
        <div className={`bg-${readinessColor}-50 border-b border-${readinessColor}-100 p-5`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-bold text-slate-900 flex items-center gap-2"><Award className={`h-5 w-5 text-${readinessColor}-600`} /> Quiz results</h2>
              <p className="text-sm text-muted-foreground mt-1">{result.score} / {result.total} correct</p>
            </div>
            <div className="text-center">
              <div className={`text-4xl font-black text-${readinessColor}-600`}>{result.pct}%</div>
              <Badge className={`bg-${readinessColor}-100 text-${readinessColor}-700 border-${readinessColor}-200`}>{result.readinessLabel}</Badge>
            </div>
          </div>

          {result.trend && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              {result.trend.delta > 0 ? (
                <ArrowUp className="h-4 w-4 text-emerald-600" />
              ) : result.trend.delta < 0 ? (
                <ArrowDown className="h-4 w-4 text-red-500" />
              ) : (
                <Minus className="h-4 w-4 text-slate-400" />
              )}
              <span className="text-slate-600">
                {result.trend.delta > 0 ? "+" : ""}{result.trend.delta}% vs. your last attempt ({result.trend.previousPct}%) — attempt #{result.trend.attemptNumber}
              </span>
            </div>
          )}

          {result.roomComparison && (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <Users className="h-4 w-4" />
              Group average: {result.roomComparison.roomAveragePct}% —{" "}
              {result.roomComparison.aboveAverage ? "you're above average" : "you're below average"} ({result.roomComparison.membersReporting} reporting)
            </div>
          )}
        </div>

        <div className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm"><BarChart2 className="h-4 w-4" /> Topic breakdown</h3>
          <div className="space-y-3">
            {result.topicBreakdown.map((t) => (
              <div key={t.topic}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 font-medium">{t.topic}</span>
                  <span className={`font-semibold ${t.pct >= 70 ? "text-emerald-600" : "text-red-500"}`}>{t.correct}/{t.total} · {t.pct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${t.pct >= 70 ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-emerald-700 mb-2 flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" /> Strengths</h3>
          {strengths.length === 0 ? <p className="text-sm text-muted-foreground">Keep studying — strengths will emerge!</p> : (
            <ul className="space-y-1.5">{strengths.map((t) => <li key={t.topic} className="text-sm text-slate-700">{t.topic} — {t.pct}%</li>)}</ul>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-red-600 mb-2 flex items-center gap-2 text-sm"><TrendingDown className="h-4 w-4" /> Needs review</h3>
          {weaknesses.length === 0 ? <p className="text-sm text-muted-foreground">Excellent — no weak areas!</p> : (
            <ul className="space-y-1.5">{weaknesses.map((t) => <li key={t.topic} className="text-sm text-slate-700">{t.topic} — {t.pct}%</li>)}</ul>
          )}
        </Card>
      </div>

      {result.missedQuestions.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Review missed questions ({result.missedQuestions.length})</h3>
          <div className="space-y-3">
            {result.missedQuestions.map((m) => (
              <div key={m.questionId} className="border-l-2 border-red-300 pl-3">
                <p className="text-sm font-medium text-slate-800">{m.question}</p>
                <p className="text-xs text-slate-500 mt-1">Your answer: <span className="text-red-500">{m.yourAnswer ?? "—"}</span></p>
                <p className="text-xs text-slate-500">Correct answer: <span className="text-emerald-600">{m.correctAnswer}</span></p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onRetake} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Retake quiz</Button>
        {!suggestions && (
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => getNextSuggestions(courseId).then(setSuggestions).catch(() => setSuggestions([]))}
          >
            <Sparkles className="h-3.5 w-3.5" /> What should I learn next?
          </Button>
        )}
      </div>

      {suggestions && suggestions.length > 0 && (
        <Card className="p-4 sm:p-5 bg-blue-50/50 border-blue-100">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" /> Continue your learning journey</h3>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-100 p-3">
                <p className="text-sm font-medium text-slate-800">{s.topic}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.reason}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Dashboard tab ───────────────────────────────────────────────────────────

function DashboardTab({ roomId }: { roomId: string }) {
  const [dashboard, setDashboard] = useState<RoomDashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const d = await getDashboard(roomId);
        if (!stopped) setDashboard(d);
      } catch {
        if (!stopped) setError(true);
      }
      if (!stopped) timer = setTimeout(poll, 8000);
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [roomId]);

  if (error) return <p className="text-sm text-red-500 text-center py-16">Couldn't load the dashboard.</p>;
  if (!dashboard) return <div className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></div>;

  return (
    <div className="space-y-5">
      {dashboard.room.remedialTriggered && (
        <Card className="p-4 bg-amber-50 border-amber-200 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">The group reached its completion threshold — a remedial lesson targeting the weakest shared topic has been generated and added for everyone.</p>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Members ({dashboard.members.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Lessons watched</th>
                <th className="pb-2 font-medium">Quiz score</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.members.map((m) => (
                <tr key={m.userId} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{m.name}</td>
                  <td className="py-2.5 text-slate-600">{m.lessonsWatched}/{m.totalLessons} ({m.watchPct}%)</td>
                  <td className="py-2.5 text-slate-600">{m.quizSubmitted ? `${m.quizPct}%` : "—"}</td>
                  <td className="py-2.5">
                    {m.completed ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Completed</Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">In progress</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4" /> Group topic strengths &amp; weaknesses</h3>
        {dashboard.groupTopics.length === 0 ? (
          <p className="text-sm text-slate-500">No quiz attempts yet.</p>
        ) : (
          <div className="space-y-3">
            {dashboard.groupTopics.map((t) => (
              <div key={t.topic}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 font-medium">{t.topic}</span>
                  <span className={`font-semibold ${t.avgPct >= 70 ? "text-emerald-600" : "text-red-500"}`}>{t.avgPct}% avg · {t.respondents} reporting</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${t.avgPct >= 70 ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${t.avgPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {(dashboard.mostReplayedLessons.length > 0 || dashboard.mostReplayedScenes.length > 0) && (
        <Card className="p-4 sm:p-5">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Most replayed</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Lessons</p>
              {dashboard.mostReplayedLessons.length === 0 ? <p className="text-sm text-slate-400">No replays yet.</p> : (
                <ul className="space-y-1.5">
                  {dashboard.mostReplayedLessons.map((l) => (
                    <li key={l.lessonNumber} className="text-sm text-slate-700 flex justify-between">
                      <span className="truncate">{l.title}</span>
                      <span className="text-slate-400 shrink-0 ml-2">×{l.replayCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Scenes</p>
              {dashboard.mostReplayedScenes.length === 0 ? <p className="text-sm text-slate-400">No scene replays yet.</p> : (
                <ul className="space-y-1.5">
                  {dashboard.mostReplayedScenes.map((s, i) => (
                    <li key={i} className="text-sm text-slate-700 flex justify-between">
                      <span className="truncate">{s.lessonTitle} — {s.sceneLabel}</span>
                      <span className="text-slate-400 shrink-0 ml-2">×{s.replayCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
