"use client";

import { useEffect, useState } from "react";
import { Users, BookOpen, TrendingUp, CreditCard, DollarSign, Eye, Activity, RefreshCw, Wrench, Loader2 } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, StatCard, LoadingBlock, ErrorBlock, StatusBadge, fmtDate, fmtUsd } from "../components";
import { Link } from "react-router-dom";

interface Overview {
  users: { total: number; verified: number; unverified: number; newThisWeek: number };
  courses: { total: number; last24h: number; last7d: number; freeTrial: number; paid: number; status: { generating: number; ready: number; failed: number } };
  generationHealth: { lessonStatus: { rendering: number; ready: number; failed: number; locked: number }; totalLessons: number; lessonSuccessRate: number | null };
  creditsProxy: { totalRemainingCredits: number };
  aiSpend: { today: number; last7d: number; last30d: number; byKind: { kind: string; totalUsd: number; calls: number }[] };
  pageViews: { today: number; last7d: number };
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

export default function Overview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [ov, act] = await Promise.all([
        adminApi.get<Overview>("/api/admin/overview"),
        adminApi.get<{ activity: ActivityItem[] }>("/api/admin/activity?limit=15"),
      ]);
      setOverview(ov);
      setActivity(act.activity);
    } catch (err: any) {
      setError(err.message || "Something went wrong loading the dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!overview) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Overview"
        sub={`Updated ${fmtDate(overview.generatedAt)}`}
        right={
          <button
            onClick={() => { setRefreshing(true); load(); }}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      <MaintenanceModeCard />

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

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Link to="/admin/ai-spend" className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 transition-colors">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><DollarSign className="h-4 w-4 text-slate-400" /> AI spend</h3>
          <div className="text-3xl font-bold text-slate-900">{fmtUsd(overview.aiSpend.today)}</div>
          <div className="text-xs text-slate-500 mt-1">today · {fmtUsd(overview.aiSpend.last7d)} last 7d · {fmtUsd(overview.aiSpend.last30d)} last 30d</div>
        </Link>

        <Link to="/admin/traffic" className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 transition-colors">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Eye className="h-4 w-4 text-slate-400" /> Page views</h3>
          <div className="text-3xl font-bold text-slate-900">{overview.pageViews.today}</div>
          <div className="text-xs text-slate-500 mt-1">today · {overview.pageViews.last7d} last 7 days</div>
        </Link>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-slate-400" /> Lesson health</h3>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-emerald-50 rounded-lg p-2"><div className="text-xl font-bold text-emerald-600">{overview.generationHealth.lessonStatus.ready}</div><div className="text-[11px] text-emerald-700">Ready</div></div>
            <div className="bg-red-50 rounded-lg p-2"><div className="text-xl font-bold text-red-600">{overview.generationHealth.lessonStatus.failed}</div><div className="text-[11px] text-red-700">Failed</div></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Activity className="h-4 w-4 text-slate-400" /> Recent activity</h3>
          <Link to="/admin/courses" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">View all courses →</Link>
        </div>
        <div className="divide-y divide-slate-100">
          {activity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No activity yet.</p>
          ) : activity.map((a) => (
            <Link key={a.id} to={`/admin/courses/${a.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{a.topic || "Untitled"}</p>
                <p className="text-xs text-slate-400 truncate">{a.user ? `${a.user.name} · ${a.user.email}` : "Unknown user"} · {fmtDate(a.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.isFreeTrial && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">trial</span>}
                <span className="text-xs text-slate-500">{a.lessonsReady}/{a.lessonsTotal}</span>
                <StatusBadge status={a.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

interface MaintenanceConfig {
  active: boolean;
  message: string;
}

// Toggle for the site-wide maintenance mode (see App.tsx's MaintenanceGate
// and the server-side gate in app.js). Loads/saves independently of the rest
// of the Overview page's data so a slow /overview call never delays this.
function MaintenanceModeCard() {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .get<MaintenanceConfig>("/api/admin/maintenance")
      .then((c) => { setConfig(c); setDraftMessage(c.message); })
      .catch((err) => setError(err.message || "Failed to load maintenance status."))
      .finally(() => setLoading(false));
  }, []);

  const save = async (next: Partial<MaintenanceConfig>) => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.put<MaintenanceConfig>("/api/admin/maintenance", {
        active: next.active ?? config.active,
        message: next.message ?? draftMessage,
      });
      setConfig(updated);
      setDraftMessage(updated.message);
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="mb-6 h-16 rounded-xl border border-slate-200 bg-white animate-pulse" />;
  }
  if (error && !config) {
    return <div className="mb-6"><ErrorBlock message={error} /></div>;
  }
  if (!config) return null;

  return (
    <div
      className={`mb-6 rounded-xl border p-5 transition-colors ${
        config.active ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${config.active ? "bg-amber-100" : "bg-slate-100"}`}>
            <Wrench className={`h-4 w-4 ${config.active ? "text-amber-600" : "text-slate-400"}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">
              Maintenance mode {config.active && <span className="text-amber-700">— ACTIVE</span>}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {config.active
                ? "Everyone except admins sees the maintenance page. Course generation and other activity are blocked."
                : "Site is running normally."}
            </p>
          </div>
        </div>

        <button
          onClick={() => save({ active: !config.active })}
          disabled={saving}
          className={`shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
            config.active ? "bg-amber-500" : "bg-slate-200"
          }`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.active ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Message shown to users</label>
          <textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <button
          onClick={() => save({ message: draftMessage })}
          disabled={saving || draftMessage === config.message}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save message
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
