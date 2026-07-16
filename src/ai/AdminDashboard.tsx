"use client";

import { useEffect, useState } from "react";
import { PageMeta } from "../components/PageMeta";
import { DynamicPlayer } from "../remotion/DynamicPlayer";
import {
  Users, BookOpen, CheckCircle, XCircle, Loader2, Clock,
  TrendingUp, AlertTriangle, CreditCard, Activity, X, Play, RefreshCw,
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface Overview {
  users: { total: number; verified: number; unverified: number; newThisWeek: number };
  courses: { total: number; last24h: number; last7d: number; freeTrial: number; paid: number; status: { generating: number; ready: number; failed: number } };
  generationHealth: { lessonStatus: { rendering: number; ready: number; failed: number; locked: number }; totalLessons: number; lessonSuccessRate: number | null };
  creditsProxy: { totalRemainingCredits: number };
  generatedAt: string;
}

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

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className={accent || "text-slate-300"}>{icon}</div>
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const [ovRes, actRes] = await Promise.all([
        fetch(`${BASE_URL}/api/admin/overview`, { headers: authHeaders() }),
        fetch(`${BASE_URL}/api/admin/activity?limit=30`, { headers: authHeaders() }),
      ]);
      if (ovRes.status === 403 || actRes.status === 403) {
        setError("You don't have admin access.");
        setLoading(false);
        return;
      }
      if (!ovRes.ok || !actRes.ok) throw new Error("Failed to load dashboard");
      setOverview(await ovRes.json());
      setActivity((await actRes.json()).activity);
    } catch (err: any) {
      setError(err.message || "Something went wrong loading the dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCourse = async (courseId: string) => {
    setCourseLoading(true);
    setSelectedCourse(null);
    setPreviewLesson(null);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/courses/${courseId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load course");
      const data = await res.json();
      setSelectedCourse(data.course);
    } catch (err) {
      console.error(err);
    } finally {
      setCourseLoading(false);
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-1">Can't load dashboard</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const statusColor = (s: string) =>
    s === "ready" ? "text-emerald-600 bg-emerald-50" :
    s === "failed" ? "text-red-600 bg-red-50" :
    s === "generating" ? "text-blue-600 bg-blue-50" : "text-slate-500 bg-slate-100";

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta title="AI Admin | Level Up AI" noindex />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Level Up — Admin</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Updated {overview ? fmtDate(overview.generatedAt) : "—"}
            </p>
          </div>
          <button
            onClick={() => { setRefreshing(true); load(); }}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {overview && (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard icon={<Users className="h-5 w-5" />} accent="text-blue-500" label="Users" value={overview.users.total}
                sub={`${overview.users.verified} verified · ${overview.users.newThisWeek} new this week`} />
              <StatCard icon={<BookOpen className="h-5 w-5" />} accent="text-indigo-500" label="Courses" value={overview.courses.total}
                sub={`${overview.courses.last24h} today · ${overview.courses.last7d} this week`} />
              <StatCard icon={<TrendingUp className="h-5 w-5" />} accent="text-emerald-500" label="Lesson success" value={overview.generationHealth.lessonSuccessRate !== null ? `${overview.generationHealth.lessonSuccessRate}%` : "—"}
                sub={`${overview.generationHealth.lessonStatus.ready} ready · ${overview.generationHealth.lessonStatus.failed} failed`} />
              <StatCard icon={<CreditCard className="h-5 w-5" />} accent="text-amber-500" label="Credits outstanding" value={overview.creditsProxy.totalRemainingCredits}
                sub={`${overview.courses.paid} paid · ${overview.courses.freeTrial} free trial`} />
            </div>

            {/* Health + cost row */}
            <div className="grid lg:grid-cols-3 gap-4 mb-6">
              {/* Course status */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-slate-400" /> Course status</h3>
                <div className="space-y-3">
                  {[
                    { label: "Generating", val: overview.courses.status.generating, color: "bg-blue-500" },
                    { label: "Ready", val: overview.courses.status.ready, color: "bg-emerald-500" },
                    { label: "Failed", val: overview.courses.status.failed, color: "bg-red-500" },
                  ].map((row) => {
                    const total = overview.courses.total || 1;
                    return (
                      <div key={row.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600">{row.label}</span>
                          <span className="font-semibold text-slate-900">{row.val}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className={`${row.color} h-1.5 rounded-full`} style={{ width: `${(row.val / total) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lesson health */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><CheckCircle className="h-4 w-4 text-slate-400" /> Lesson health</h3>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-emerald-50 rounded-lg p-3"><div className="text-2xl font-bold text-emerald-600">{overview.generationHealth.lessonStatus.ready}</div><div className="text-xs text-emerald-700 mt-0.5">Ready</div></div>
                  <div className="bg-red-50 rounded-lg p-3"><div className="text-2xl font-bold text-red-600">{overview.generationHealth.lessonStatus.failed}</div><div className="text-xs text-red-700 mt-0.5">Failed</div></div>
                  <div className="bg-blue-50 rounded-lg p-3"><div className="text-2xl font-bold text-blue-600">{overview.generationHealth.lessonStatus.rendering}</div><div className="text-xs text-blue-700 mt-0.5">Rendering</div></div>
                  <div className="bg-amber-50 rounded-lg p-3"><div className="text-2xl font-bold text-amber-600">{overview.generationHealth.lessonStatus.locked}</div><div className="text-xs text-amber-700 mt-0.5">Locked</div></div>
                </div>
              </div>

              {/* Costs — stubbed */}
              <div className="bg-white rounded-xl border border-slate-200 border-dashed p-5 flex flex-col items-center justify-center text-center">
                <Clock className="h-7 w-7 text-slate-300 mb-2" />
                <h3 className="text-sm font-semibold text-slate-600">Cost & timing tracking</h3>
                <p className="text-xs text-slate-400 mt-1">Coming soon — needs per-course usage logging added to the backend.</p>
              </div>
            </div>

            {/* Activity feed */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Activity className="h-4 w-4 text-slate-400" /> Recent activity</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {activity.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No activity yet.</p>
                ) : activity.map((a) => (
                  <button key={a.id} onClick={() => openCourse(a.id)} className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 text-left transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{a.topic || "Untitled"}</p>
                      <p className="text-xs text-slate-400 truncate">{a.user ? `${a.user.name} · ${a.user.email}` : "Unknown user"} · {fmtDate(a.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.isFreeTrial && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">trial</span>}
                      <span className="text-xs text-slate-500">{a.lessonsReady}/{a.lessonsTotal}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(a.status)}`}>{a.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Course detail / video preview modal */}
      {(selectedCourse || courseLoading) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setSelectedCourse(null); setPreviewLesson(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {courseLoading ? (
              <div className="p-12 flex items-center justify-center"><Loader2 className="h-7 w-7 text-slate-400 animate-spin" /></div>
            ) : selectedCourse && (
              <>
                <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-900 truncate">{selectedCourse.topic}</h2>
                    <p className="text-xs text-slate-400 truncate">{selectedCourse.userId ? `${selectedCourse.userId.name} · ${selectedCourse.userId.email}` : "Unknown"}</p>
                  </div>
                  <button onClick={() => { setSelectedCourse(null); setPreviewLesson(null); }} className="text-slate-400 hover:text-slate-600 shrink-0 ml-3"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-6">
                  {previewLesson !== null && selectedCourse.lessons[previewLesson]?.code ? (
                    <div className="mb-4">
                      <button onClick={() => setPreviewLesson(null)} className="text-xs text-blue-600 mb-3">← Back to lessons</button>
                      <DynamicPlayer code={selectedCourse.lessons[previewLesson].code} durationInFrames={selectedCourse.lessons[previewLesson].totalFrames ?? 3600} />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedCourse.lessons.map((l: any, i: number) => (
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
                          {l.status === "ready" && l.code && (
                            <button onClick={() => setPreviewLesson(i)} className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg">
                              <Play className="h-3 w-3" /> Preview
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}