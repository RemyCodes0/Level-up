"use client";

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, XCircle, Clock, Loader2, Play, Trash2, DollarSign, Code2, Copy, Check, Timer, ArrowLeft } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, Card, RowList, ROW_HOVER, Segmented, Modal, Chip,
  LoadingBlock, ErrorBlock, EmptyState, StatusBadge, Pagination,
  fmtDate, fmtUsd, fmtPosition, fmtDuration,
} from "../components";
import { EYEBROW, cx } from "../theme";
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

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "generating", label: "Generating" },
  { key: "ready", label: "Ready" },
  { key: "failed", label: "Failed" },
];

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
    <Page>
      <PageHeader
        title="Courses"
        sub="Every AI-generated course across all users."
        right={<Segmented options={STATUS_FILTERS} value={status} onChange={(s) => { setStatus(s); setPage(1); }} />}
      />

      {genStats && genStats.avgSec != null && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-[#11131A] px-5 py-3.5 text-[13px] ring-1 ring-white/[0.07]">
          <Timer className="h-4 w-4 shrink-0 text-[#6E7389]" />
          <span className="text-[#8A8FA3]">Average generation time</span>
          <span className="font-semibold text-white">{fmtDuration(genStats.avgSec)}</span>
          <span className="text-[11px] text-[#4A4F63]">
            across {genStats.coursesCounted} finished course{genStats.coursesCounted === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : (
        <Card pad={false}>
          {activity.length === 0 ? (
            <div className="p-5"><EmptyState label="courses" /></div>
          ) : (
            <RowList>
              {activity.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/admin/courses/${a.id}`)}
                  className={cx("flex w-full items-center gap-4 px-5 py-3 text-left", ROW_HOVER)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#ECEDF2]">{a.topic || "Untitled"}</p>
                    <p className="truncate text-[11px] text-[#6E7389]">
                      {a.user ? `${a.user.name} · ${a.user.email}` : "Unknown user"} · {fmtDate(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {a.isFreeTrial && <Chip>trial</Chip>}
                    {a.lessonsFailed > 0 && <Chip tone="danger">{a.lessonsFailed} failed</Chip>}
                    <LessonPips ready={a.lessonsReady} failed={a.lessonsFailed} total={a.lessonsTotal} />
                    <StatusBadge status={a.status} />
                  </div>
                </button>
              ))}
            </RowList>
          )}
          <Pagination page={page} pages={pages} onChange={setPage} />
        </Card>
      )}

      {courseId && <CourseDetailModal courseId={courseId} onClose={() => navigate("/admin/courses")} onDeleted={load} />}
    </Page>
  );
}

/**
 * One dot per lesson — ready / failed / still pending. Reads at a glance in a
 * long list where "4/6" doesn't say whether the other two failed or are still
 * building. Collapses to a plain count past 12 lessons.
 */
function LessonPips({ ready, failed, total }: { ready: number; failed: number; total: number }) {
  if (total === 0 || total > 12) {
    return <span className="text-[11px] tabular-nums text-[#6E7389]">{ready}/{total}</span>;
  }
  return (
    <span className="hidden items-center gap-[3px] sm:flex" title={`${ready} ready · ${failed} failed · ${total} total`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx(
            "h-1.5 w-1.5 rounded-full",
            i < ready ? "bg-[#3DDC97]" : i < ready + failed ? "bg-[#FF5C6C]" : "bg-white/[0.14]"
          )}
        />
      ))}
    </span>
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

  if (loading) {
    return (
      <Modal title="Loading…" onClose={onClose} width="xl">
        <div className="flex items-center justify-center p-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#8B7CFF]" />
        </div>
      </Modal>
    );
  }
  if (!course) return null;

  return (
    <Modal
      title={course.topic}
      sub={course.userId ? `${course.userId.name} · ${course.userId.email}` : "Unknown owner"}
      onClose={onClose}
      width="xl"
      actions={
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-[#FF5C6C]/10 hover:text-[#FF8A95] disabled:opacity-40"
          title="Delete course permanently"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      }
    >
      {(costs || genTime) && (
        <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
          {costs && (
            <div className="bg-[#0E1016] px-6 py-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-[#6E7389]" />
                <span className={EYEBROW}>Total cost</span>
              </div>
              <div className="mt-1.5 text-2xl font-semibold leading-none text-white tabular-nums">{fmtUsd(costs.totalUsd)}</div>
              {/* Not every dollar here is equally certain — LLM calls carry
                  OpenRouter's own actually-billed amount, but TTS (Kokoro
                  returns no cost field at all) is always a per-character
                  estimate. Showing the split instead of one flat number is
                  the whole point of this endpoint's real/estimated
                  breakdown — see adminController.js's getCourseCosts. */}
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#6E7389]">
                {fmtUsd(costs.realUsd)} actual (OpenRouter-billed)
                {costs.estimatedUsd > 0 && <> · {fmtUsd(costs.estimatedUsd)} estimated (TTS has no real-cost figure)</>}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {costs.byKind.map((k) => (
                  <Chip key={k.kind}>
                    {k.kind}: {fmtUsd(k.totalUsd)} ({k.calls}){k.estimatedUsd > 0 && k.realUsd > 0 && " · mixed"}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {genTime && (
            <div className="bg-[#0E1016] px-6 py-4">
              <div className="flex items-center gap-2">
                <Timer className="h-3.5 w-3.5 text-[#6E7389]" />
                <span className={EYEBROW}>Generation time</span>
              </div>
              <div className="mt-1.5 text-2xl font-semibold leading-none text-white tabular-nums">{fmtDuration(genTime.totalSec)}</div>
              {/* Sum of each lesson's own generation time, not literal
                  wall-clock — lessons build concurrently (see
                  buildLessonsConcurrently), so what the user actually
                  waited is shorter than this total. See
                  getCourseGenerationTime's own comment. */}
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#6E7389]">
                Sum of each lesson's own time — lessons build concurrently, so the real wait was shorter.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {genTime.lessons.map((l) => (
                  <Chip key={l.lessonNumber} tone={l.status === "failed" ? "danger" : "neutral"}>
                    L{l.lessonNumber}: {fmtDuration(l.durationSec)}
                    {l.attempts > 1 && ` (${l.attempts} attempts)`}
                    {l.status === "failed" && " · failed"}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-6">
        {previewLesson !== null && course.lessons[previewLesson]?.code ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                onClick={() => { setPreviewLesson(null); setShowCode(false); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B4A9FF] transition-colors hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> All lessons
              </button>
              <button
                onClick={() => setShowCode((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-[#D6D8E2] ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.09]"
              >
                <Code2 className="h-3.5 w-3.5" /> {showCode ? "Hide code" : "View code"}
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl ring-1 ring-white/[0.08]">
              <DynamicPlayer
                code={course.lessons[previewLesson].code}
                durationInFrames={course.lessons[previewLesson].totalFrames ?? 3600}
              />
            </div>
            {showCode && (
              <div className="relative mt-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(course.lessons[previewLesson].code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1 text-xs font-medium text-[#D6D8E2] ring-1 ring-inset ring-white/[0.1] backdrop-blur transition-colors hover:bg-white/[0.14] hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                </button>
                <pre className="ad-scroll max-h-[500px] overflow-auto whitespace-pre rounded-2xl bg-[#07080C] p-4 pt-10 text-[11px] leading-relaxed text-[#B9BCCB] ring-1 ring-inset ring-white/[0.07]">
                  {course.lessons[previewLesson].code}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {course.lessons.map((l: any, i: number) => {
              const progress = progressByLesson?.get(i + 1);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-3.5 py-3 ring-1 ring-inset ring-white/[0.05] transition-colors hover:bg-white/[0.04]"
                >
                  <span className="shrink-0">
                    {l.status === "ready" ? <CheckCircle className="h-4 w-4 text-[#3DDC97]" /> :
                     l.status === "failed" ? <XCircle className="h-4 w-4 text-[#FF5C6C]" /> :
                     l.status === "locked" ? <Clock className="h-4 w-4 text-[#FFB547]" /> :
                     <Loader2 className="h-4 w-4 animate-spin text-[#8B7CFF]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[#ECEDF2]">
                      <span className="font-mono text-[11px] text-[#4A4F63]">{String(i + 1).padStart(2, "0")}</span>{" "}
                      {l.title}
                    </p>
                    {l.status === "failed" && l.error && <p className="truncate text-[11px] text-[#FF8A95]">{l.error}</p>}
                  </div>
                  {progress && (
                    <div className="shrink-0 text-right text-[11px]">
                      {progress.watched ? (
                        <span className="font-medium text-[#3DDC97]">Watched</span>
                      ) : progress.lastPositionFrame > 0 ? (
                        <span className="font-medium text-[#FFB547]">In progress</span>
                      ) : (
                        <span className="text-[#4A4F63]">Not started</span>
                      )}
                      {progress.lastPositionFrame > 0 && (
                        <p className="tabular-nums text-[#6E7389]">{fmtPosition(progress.lastPositionFrame, progress.totalFrames)}</p>
                      )}
                    </div>
                  )}
                  {l.status === "ready" && l.code && (
                    <button
                      onClick={() => setPreviewLesson(i)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#8B7CFF]/12 px-3 py-1.5 text-xs font-medium text-[#B4A9FF] ring-1 ring-inset ring-[#8B7CFF]/25 transition-colors hover:bg-[#8B7CFF]/20 hover:text-white"
                    >
                      <Play className="h-3 w-3" /> Preview
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
