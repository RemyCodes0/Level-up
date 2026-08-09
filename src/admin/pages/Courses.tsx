"use client";

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, XCircle, Clock, Loader2, Play, X, Trash2, DollarSign, Code2, Copy, Check, Timer } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState, StatusBadge, Pagination, fmtDate, fmtUsd, fmtPosition, fmtDuration } from "../components";
import { DynamicPlayer } from "../../remotion/DynamicPlayer";

interface ActivityItem {
  id: string;
  topic: string;
  status: string;
  isFreeTrial: boolean;
  lessonsReady: number;
  lessonsFailed: number;
  lessonsTotal: number;
  user: { name: string; email: string } | null;
  createdAt: string;
}

const STATUS_FILTERS = ["all", "generating", "ready", "failed"];

export default function Courses() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Dashboard-wide, independent of pagination/status filter — see
  // adminController.js's getCourseGenerationStats for how this is computed
  // (average, across every FINISHED course, of that course's lessons'
  // generation times summed together).
  const [genStats, setGenStats] = useState<{ avgSec: number | null; coursesCounted: number } | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const statusParam = status !== "all" ? `&status=${status}` : "";
    adminApi
      .get<{ activity: ActivityItem[]; pagination: { page: number; pages: number } }>(
        `/api/admin/activity?limit=20&page=${page}${statusParam}`
      )
      .then((res) => { setActivity(res.activity); setPages(res.pagination.pages); })
      .catch((err) => setError(err.message || "Failed to load courses."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, status]);

  // Fetched once, not tied to pagination/status — it's an "overall" figure.
  useEffect(() => {
    adminApi
      .get<{ avgSec: number | null; coursesCounted: number }>("/api/admin/courses/generation-stats")
      .then(setGenStats)
      .catch((err) => console.error("Failed to load generation stats:", err));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Courses"
        sub="Every AI-generated course across all users."
        right={
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  status === s ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        }
      />

      {genStats && genStats.avgSec != null && (
        <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
          <Timer className="h-4 w-4 text-slate-400" />
          Avg. generation time: <span className="font-semibold text-slate-700">{fmtDuration(genStats.avgSec)}</span>
          <span className="text-slate-400">(across {genStats.coursesCounted} finished course{genStats.coursesCounted === 1 ? "" : "s"})</span>
        </div>
      )}

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {activity.length === 0 ? (
              <div className="p-8"><EmptyState label="courses" /></div>
            ) : activity.map((a) => (
              <button key={a.id} onClick={() => navigate(`/admin/courses/${a.id}`)} className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 text-left transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{a.topic || "Untitled"}</p>
                  <p className="text-xs text-slate-400 truncate">{a.user ? `${a.user.name} · ${a.user.email}` : "Unknown user"} · {fmtDate(a.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.isFreeTrial && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">trial</span>}
                  <span className="text-xs text-slate-500">{a.lessonsReady}/{a.lessonsTotal}</span>
                  <StatusBadge status={a.status} />
                </div>
              </button>
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </div>
      )}

      {courseId && <CourseDetailModal courseId={courseId} onClose={() => navigate("/admin/courses")} onDeleted={load} />}
    </div>
  );
}

interface LessonProgressInfo {
  lessonNumber: number;
  watched: boolean;
  watchedAt: string | null;
  lastPositionFrame: number;
  totalFrames: number | null;
}

function CourseDetailModal({ courseId, onClose, onDeleted }: { courseId: string; onClose: () => void; onDeleted: () => void }) {
  const [course, setCourse] = useState<any | null>(null);
  const [costs, setCosts] = useState<{
    totalUsd: number;
    realUsd: number;
    estimatedUsd: number;
    byKind: { kind: string; totalUsd: number; calls: number; realUsd: number; estimatedUsd: number }[];
  } | null>(null);
  // Total time this course took to generate, broken down by lesson — see
  // adminController.js's getCourseGenerationTime. null (not just absent)
  // for a course that hasn't started generating yet / has no GenerationLog
  // entries, so the UI can tell "no data yet" apart from "loading."
  const [genTime, setGenTime] = useState<{
    totalSec: number;
    lessons: { lessonNumber: number; lessonTitle: string | null; durationSec: number; status: string; attempts: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLesson, setPreviewLesson] = useState<number | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Keyed by lessonNumber — this course's owner's watch/position state for
  // each lesson. A course belongs to exactly one userId (see Course.js), so
  // this reuses the same GET /api/admin/users/:userId/progress endpoint
  // built for the Users page rather than a second, course-scoped one.
  const [progressByLesson, setProgressByLesson] = useState<Map<number, LessonProgressInfo> | null>(null);

  useEffect(() => {
    setLoading(true);
    setPreviewLesson(null);
    setProgressByLesson(null);
    setGenTime(null);
    Promise.all([
      adminApi.get<{ course: any }>(`/api/admin/courses/${courseId}`),
      adminApi.get<{ totalUsd: number; realUsd: number; estimatedUsd: number; byKind: any[] }>(`/api/admin/courses/${courseId}/costs`),
      adminApi.get<{ totalSec: number; lessons: any[] }>(`/api/admin/courses/${courseId}/generation-time`),
    ])
      .then(([c, costData, genTimeData]) => {
        setCourse(c.course);
        setCosts(costData);
        setGenTime(genTimeData.lessons.length > 0 ? genTimeData : null);
        const ownerId = c.course?.userId?._id;
        if (!ownerId) return;
        adminApi
          .get<{ courses: { courseId: string; lessons: LessonProgressInfo[] }[] }>(`/api/admin/users/${ownerId}/progress`)
          .then((res) => {
            const match = res.courses.find((cs) => cs.courseId === courseId);
            setProgressByLesson(new Map((match?.lessons || []).map((l) => [l.lessonNumber, l])));
          })
          .catch((err) => console.error("Failed to load lesson progress:", err));
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [courseId]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this course permanently? This can't be undone.")) return;
    setDeleting(true);
    try {
      await adminApi.delete(`/api/admin/courses/${courseId}`);
      onDeleted();
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to delete course.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="p-12 flex items-center justify-center"><Loader2 className="h-7 w-7 text-slate-400 animate-spin" /></div>
        ) : course && (
          <>
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 truncate">{course.topic}</h2>
                <p className="text-xs text-slate-400 truncate">{course.userId ? `${course.userId.name} · ${course.userId.email}` : "Unknown"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button onClick={handleDelete} disabled={deleting} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>
            </div>

            {costs && (
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">Total cost: {fmtUsd(costs.totalUsd)}</span>
                </div>
                {/* Not every dollar here is equally certain — LLM calls carry
                    OpenRouter's own actually-billed amount, but TTS (Kokoro
                    returns no cost field at all) is always a per-character
                    estimate. Showing the split instead of one flat number is
                    the whole point of this endpoint's real/estimated
                    breakdown — see adminController.js's getCourseCosts. */}
                <p className="text-xs text-slate-400 mb-2">
                  {fmtUsd(costs.realUsd)} actual (OpenRouter-billed)
                  {costs.estimatedUsd > 0 && <> · {fmtUsd(costs.estimatedUsd)} estimated (TTS has no real-cost figure)</>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {costs.byKind.map((k) => (
                    <span key={k.kind} className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600">
                      {k.kind}: {fmtUsd(k.totalUsd)} ({k.calls}){k.estimatedUsd > 0 && k.realUsd > 0 && " · mixed"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {genTime && (
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">Total generation time: {fmtDuration(genTime.totalSec)}</span>
                </div>
                {/* Sum of each lesson's own generation time, not literal
                    wall-clock — lessons build concurrently (see
                    buildLessonsConcurrently), so what the user actually
                    waited is shorter than this total. See
                    getCourseGenerationTime's own comment. */}
                <p className="text-xs text-slate-400 mb-2">Sum of each lesson's own generation time — lessons build concurrently, so actual wait was shorter.</p>
                <div className="flex flex-wrap gap-2">
                  {genTime.lessons.map((l) => (
                    <span
                      key={l.lessonNumber}
                      className={`text-xs px-2 py-1 rounded-lg bg-white border text-slate-600 ${l.status === "failed" ? "border-red-200" : "border-slate-200"}`}
                    >
                      L{l.lessonNumber}: {fmtDuration(l.durationSec)}{l.attempts > 1 && ` (${l.attempts} attempts)`}{l.status === "failed" && " · failed"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="p-6">
              {previewLesson !== null && course.lessons[previewLesson]?.code ? (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => { setPreviewLesson(null); setShowCode(false); }} className="text-xs text-blue-600">← Back to lessons</button>
                    <button
                      onClick={() => setShowCode((v) => !v)}
                      className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg"
                    >
                      <Code2 className="h-3.5 w-3.5" /> {showCode ? "Hide code" : "View code"}
                    </button>
                  </div>
                  <DynamicPlayer code={course.lessons[previewLesson].code} durationInFrames={course.lessons[previewLesson].totalFrames ?? 3600} />
                  {showCode && (
                    <div className="mt-3 relative">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(course.lessons[previewLesson].code);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        className="absolute top-2 right-2 flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                      </button>
                      <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-200 rounded-lg p-4 pt-10 overflow-auto max-h-[500px] whitespace-pre">
                        {course.lessons[previewLesson].code}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {course.lessons.map((l: any, i: number) => {
                    const progress = progressByLesson?.get(i + 1);
                    return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
                      <div className="shrink-0">
                        {l.status === "ready" ? <CheckCircle className="h-4 w-4 text-emerald-500" /> :
                         l.status === "failed" ? <XCircle className="h-4 w-4 text-red-400" /> :
                         l.status === "locked" ? <Clock className="h-4 w-4 text-amber-400" /> :
                         <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{i + 1}. {l.title}</p>
                        {l.status === "failed" && l.error && <p className="text-xs text-red-400 truncate">{l.error}</p>}
                      </div>
                      {progress && (
                        <div className="shrink-0 text-xs text-right">
                          {progress.watched ? (
                            <span className="text-emerald-600 font-medium">Watched</span>
                          ) : progress.lastPositionFrame > 0 ? (
                            <span className="text-amber-600 font-medium">In progress</span>
                          ) : (
                            <span className="text-slate-300">Not started</span>
                          )}
                          {progress.lastPositionFrame > 0 && (
                            <p className="text-slate-400">{fmtPosition(progress.lastPositionFrame, progress.totalFrames)}</p>
                          )}
                        </div>
                      )}
                      {l.status === "ready" && l.code && (
                        <button onClick={() => setPreviewLesson(i)} className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg">
                          <Play className="h-3 w-3" /> Preview
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
