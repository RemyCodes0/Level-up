"use client";

import { useEffect, useState } from "react";
import { Users, BookOpen, TrendingUp, CreditCard, DollarSign, Eye, Activity, RefreshCw, Wrench, Loader2, ArrowRight } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, StatCard, Card, RowList, ROW_HOVER, LoadingBlock, ErrorBlock, Skeleton,
  StatusBadge, Chip, fmtDate, fmtUsd,
} from "../components";
import { BTN_SOFT, BTN_PRIMARY, EYEBROW, SURFACE, INPUT, LABEL, cx } from "../theme";
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

  const health = overview.generationHealth.lessonStatus;
  const live = overview.courses.status.generating;

  return (
    <Page max="7xl">
      <PageHeader
        title="Overview"
        sub={`Every number on this page is live from the API · updated ${fmtDate(overview.generatedAt)}`}
        right={
          <button onClick={() => { setRefreshing(true); load(); }} disabled={refreshing} className={BTN_SOFT}>
            <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin")} /> Refresh
          </button>
        }
      />

      {live > 0 && (
        <Link
          to="/admin/courses"
          className="mb-6 flex items-center gap-3 rounded-2xl bg-[#8B7CFF]/[0.07] px-5 py-3.5 ring-1 ring-inset ring-[#8B7CFF]/20 transition-colors hover:bg-[#8B7CFF]/[0.12]"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#8B7CFF]" />
            <span className="relative h-2 w-2 rounded-full bg-[#8B7CFF]" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] text-[#D6D8E2]">
            <span className="font-semibold text-white">{live}</span> course{live === 1 ? "" : "s"} generating right now
          </p>
          <ArrowRight className="h-4 w-4 shrink-0 text-[#B4A9FF]" />
        </Link>
      )}

      <MaintenanceModeCard />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} accent="text-[#B4A9FF]" label="Users" value={overview.users.total}
          sub={`${overview.users.verified} verified · ${overview.users.newThisWeek} new this week`} />
        <StatCard icon={<BookOpen className="h-4 w-4" />} accent="text-[#FFA882]" label="Courses" value={overview.courses.total}
          sub={`${overview.courses.last24h} today · ${overview.courses.last7d} this week`} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} accent="text-[#3DDC97]" label="Lesson success"
          value={overview.generationHealth.lessonSuccessRate !== null ? `${overview.generationHealth.lessonSuccessRate}%` : "—"}
          sub={`${health.ready} ready · ${health.failed} failed`} />
        <StatCard icon={<CreditCard className="h-4 w-4" />} accent="text-[#FFB547]" label="Credits outstanding" value={overview.creditsProxy.totalRemainingCredits}
          sub={`${overview.courses.paid} paid · ${overview.courses.freeTrial} free trial`} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <MetricLink
          to="/admin/ai-spend"
          icon={<DollarSign className="h-4 w-4" />}
          label="AI spend today"
          value={fmtUsd(overview.aiSpend.today)}
          sub={`${fmtUsd(overview.aiSpend.last7d)} last 7d · ${fmtUsd(overview.aiSpend.last30d)} last 30d`}
        />
        <MetricLink
          to="/admin/traffic"
          icon={<Eye className="h-4 w-4" />}
          label="Page views today"
          value={overview.pageViews.today.toLocaleString()}
          sub={`${overview.pageViews.last7d.toLocaleString()} over the last 7 days`}
        />

        <Card title="Lesson health" icon={<Activity className="h-4 w-4" />}>
          <HealthBar ready={health.ready} failed={health.failed} rendering={health.rendering} locked={health.locked} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <HealthStat label="Ready" value={health.ready} color="#3DDC97" />
            <HealthStat label="Failed" value={health.failed} color="#FF5C6C" />
          </div>
        </Card>
      </div>

      <Card
        title="Recent activity"
        icon={<Activity className="h-4 w-4" />}
        pad={false}
        action={
          <Link to="/admin/courses" className="shrink-0 text-xs font-medium text-[#B4A9FF] transition-colors hover:text-white">
            All courses →
          </Link>
        }
      >
        {activity.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#6E7389]">No activity yet.</p>
        ) : (
          <RowList>
            {activity.map((a) => (
              <Link key={a.id} to={`/admin/courses/${a.id}`} className={cx("flex items-center gap-4 px-5 py-3", ROW_HOVER)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#ECEDF2]">{a.topic || "Untitled"}</p>
                  <p className="truncate text-[11px] text-[#6E7389]">
                    {a.user ? `${a.user.name} · ${a.user.email}` : "Unknown user"} · {fmtDate(a.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.isFreeTrial && <Chip>trial</Chip>}
                  <span className="text-[11px] tabular-nums text-[#6E7389]">{a.lessonsReady}/{a.lessonsTotal}</span>
                  <StatusBadge status={a.status} />
                </div>
              </Link>
            ))}
          </RowList>
        )}
      </Card>
    </Page>
  );
}

/** A headline figure that doubles as the entry point to its own page. */
function MetricLink({ to, icon, label, value, sub }: { to: string; icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Link to={to} className={cx(SURFACE, "group flex flex-col justify-between p-5 transition-colors hover:ring-white/[0.16]")}>
      <div className="flex items-center justify-between gap-3">
        <span className={EYEBROW}>{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.05] text-[#6E7389] ring-1 ring-white/[0.07] transition-colors group-hover:text-[#B4A9FF]">
          {icon}
        </span>
      </div>
      <div className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.02em] text-white tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-[#6E7389]">
        {sub}
        <ArrowRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
    </Link>
  );
}

/** Stacked proportions of every lesson the system has ever produced. */
function HealthBar({ ready, failed, rendering, locked }: { ready: number; failed: number; rendering: number; locked: number }) {
  const total = ready + failed + rendering + locked;
  if (total === 0) return <div className="h-2 rounded-full bg-white/[0.05]" />;
  const seg = (n: number, color: string, title: string) =>
    n > 0 && <span key={title} title={`${title}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: color }} className="h-full" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
      {seg(ready, "#3DDC97", "Ready")}
      {seg(rendering, "#8B7CFF", "Generating")}
      {seg(locked, "#FFB547", "Locked")}
      {seg(failed, "#FF5C6C", "Failed")}
    </div>
  );
}

function HealthStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.05]">
      <div className="text-2xl font-semibold leading-none tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1.5 text-[11px] text-[#6E7389]">{label}</div>
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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    adminApi
      .get<MaintenanceConfig>("/api/admin/maintenance")
      .then((c) => { setConfig(c); setDraftMessage(c.message); setExpanded(c.active); })
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

  if (loading) return <Skeleton className="mb-5 h-[76px]" />;
  if (error && !config) return <div className="mb-5"><ErrorBlock message={error} /></div>;
  if (!config) return null;

  return (
    <div
      className={cx(
        "mb-5 overflow-hidden rounded-2xl ring-1 transition-colors",
        config.active ? "bg-[#FFB547]/[0.07] ring-[#FFB547]/25" : "bg-[#11131A] ring-white/[0.07]"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
              config.active ? "bg-[#FFB547]/15 ring-[#FFB547]/30" : "bg-white/[0.04] ring-white/[0.07]"
            )}
          >
            <Wrench className={cx("h-4 w-4", config.active ? "text-[#FFB547]" : "text-[#6E7389]")} />
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white">
              Maintenance mode
              {config.active && (
                <span className="rounded-full bg-[#FFB547]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#FFB547] ring-1 ring-inset ring-[#FFB547]/30">
                  Active
                </span>
              )}
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#8A8FA3]">
              {config.active
                ? "Everyone except admins sees the maintenance page — course generation is blocked."
                : "Site is running normally."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-medium text-[#6E7389] transition-colors hover:text-white"
          >
            {expanded ? "Hide message" : "Edit message"}
          </button>
          <button
            onClick={() => save({ active: !config.active })}
            disabled={saving}
            role="switch"
            aria-checked={config.active}
            aria-label="Toggle maintenance mode"
            className={cx(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
              config.active ? "bg-[#FFB547]" : "bg-white/[0.1] ring-1 ring-inset ring-white/[0.08]"
            )}
          >
            <span
              className={cx(
                "inline-block h-5 w-5 transform rounded-full shadow transition-transform",
                config.active ? "translate-x-6 bg-[#0A0B10]" : "translate-x-1 bg-[#8A8FA3]"
              )}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-5 py-4">
          <label className={LABEL}>Message shown to users</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              rows={2}
              className={cx(INPUT, "resize-y")}
            />
            <button
              onClick={() => save({ message: draftMessage })}
              disabled={saving || draftMessage === config.message}
              className={cx(BTN_PRIMARY, "shrink-0")}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
            </button>
          </div>
          {error && <p className="mt-2 text-[11px] text-[#FF8A95]">{error}</p>}
        </div>
      )}
    </div>
  );
}
