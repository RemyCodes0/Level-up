"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, X, Trash2, RotateCcw, Loader2, Repeat, Sparkles, Code2, Percent } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState, Pagination, StatCard, fmtDate } from "../components";
import { DynamicPlayer } from "../../remotion/DynamicPlayer";

// A "shadcn-style" browsable gallery for the global reusable-component
// library (see server/services/globalComponentLibrary.js) — every component
// is shown with its REAL animated preview (compiled and played through the
// exact same DynamicPlayer real lessons use, via buildPreviewCode server-
// side), not a bare accept/reject list. Candidates proposed live during
// real course generation land in the "Pending review" tab and stay
// invisible to future lessons until approved here.
interface LibraryComponentRow {
  _id: string;
  name: string;
  description: string;
  propsDoc: string;
  domainTags: string[];
  status: "candidate" | "active" | "rejected";
  usageCount: number;
  sourceCourseId: string | null;
  sourceLessonNumber: number | null;
  createdAt: string;
}

const TABS: { key: LibraryComponentRow["status"]; label: string }[] = [
  { key: "candidate", label: "Pending review" },
  { key: "active", label: "Active" },
  { key: "rejected", label: "Rejected" },
];

const PAGE_SIZE = 9; // bounds how many live players render at once

export default function ComponentLibrary() {
  const [tab, setTab] = useState<LibraryComponentRow["status"]>("candidate");
  const [components, setComponents] = useState<LibraryComponentRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalReuses: number; totalProposed: number; reuseRatePercent: number | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi
      .get<{ components: LibraryComponentRow[]; pagination: { pages: number; total: number } }>(
        `/api/admin/library-components?status=${tab}&page=${page}&limit=${PAGE_SIZE}`
      )
      .then((res) => {
        setComponents(res.components);
        setPages(res.pagination.pages);
        setCounts((prev) => ({ ...prev, [tab]: res.pagination.total }));
      })
      .catch((err) => setError(err.message || "Failed to load the component library."))
      .finally(() => setLoading(false));
  }, [tab, page]);

  useEffect(() => { load(); }, [load]);

  // Lightweight counts for the other two tabs, so the tab bar shows all
  // three totals up front instead of only the one currently open.
  useEffect(() => {
    TABS.filter((t) => t.key !== tab).forEach((t) => {
      adminApi
        .get<{ pagination: { total: number } }>(`/api/admin/library-components?status=${t.key}&limit=1`)
        .then((res) => setCounts((prev) => ({ ...prev, [t.key]: res.pagination.total })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reuse rate: "growth events" (distinct new components ever proposed by
  // real generation) vs "reuse events" (usageCount — a lesson calling an
  // already-existing component). Computed entirely server-side from data
  // already being recorded, no new tracking anywhere — see the backend
  // comment on getLibraryStats. Fetched once; approve/reject don't change
  // either number, only new course generations do.
  useEffect(() => {
    adminApi
      .get<{ totalReuses: number; totalProposed: number; reuseRatePercent: number | null }>("/api/admin/library-components/stats")
      .then(setStats)
      .catch(() => {});
  }, []);

  const refreshAfterAction = () => {
    // An approve/reject/delete moves a row out of the current tab — refresh
    // both the list and every tab's count so the bar stays accurate.
    load();
    TABS.forEach((t) => {
      adminApi
        .get<{ pagination: { total: number } }>(`/api/admin/library-components?status=${t.key}&limit=1`)
        .then((res) => setCounts((prev) => ({ ...prev, [t.key]: res.pagination.total })))
        .catch(() => {});
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Component Library"
        sub="Reusable visual components grown from real lesson generation — review, preview, and approve before they're offered to future lessons."
        right={
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  tab === t.key ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/20" : "bg-slate-100"}`}>
                  {counts[t.key] ?? "…"}
                </span>
              </button>
            ))}
          </div>
        }
      />

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            icon={<Repeat className="h-5 w-5" />}
            label="Total Reuses"
            value={stats.totalReuses}
            sub="lesson calls to an existing component"
            accent="text-emerald-500"
          />
          <StatCard
            icon={<Sparkles className="h-5 w-5" />}
            label="New Components"
            value={stats.totalProposed}
            sub="distinct pieces ever proposed by real lessons"
            accent="text-indigo-500"
          />
          <StatCard
            icon={<Percent className="h-5 w-5" />}
            label="Reuse Rate"
            value={stats.reuseRatePercent === null ? "—" : `${stats.reuseRatePercent}%`}
            sub="reuse events vs. new-component events"
            accent="text-amber-500"
          />
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : components.length === 0 ? (
        <EmptyState label={tab === "candidate" ? "components awaiting review" : `${tab} components`} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {components.map((c) => (
              <ComponentCard key={c._id} component={c} onChanged={refreshAfterAction} />
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function ComponentCard({ component, onChanged }: { component: LibraryComponentRow; onChanged: () => void }) {
  const [preview, setPreview] = useState<{ code: string; durationInFrames: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi
      .get<{ code: string; durationInFrames: number }>(`/api/admin/library-components/${component._id}/preview`)
      .then(setPreview)
      .catch((err) => setPreviewError(err.message || "Failed to build preview."));
  }, [component._id]);

  const act = async (action: "approve" | "reject" | "delete") => {
    setBusy(true);
    try {
      if (action === "delete") {
        await adminApi.delete(`/api/admin/library-components/${component._id}`);
      } else {
        await adminApi.post(`/api/admin/library-components/${component._id}/${action}`);
      }
      onChanged();
    } catch (err: any) {
      alert(err.message || `Failed to ${action} component.`);
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <div className="aspect-video bg-slate-900 relative">
        {previewError ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-red-300 px-4 text-center">{previewError}</div>
        ) : !preview ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
          </div>
        ) : (
          <DynamicPlayer code={preview.code} durationInFrames={preview.durationInFrames} />
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            {component.name}
          </h3>
          {component.status === "active" && (
            <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              <Repeat className="h-3 w-3" /> {component.usageCount} {component.usageCount === 1 ? "reuse" : "reuses"}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-2 flex-1">{component.description}</p>
        {component.propsDoc && (
          <code className="text-[11px] text-slate-400 bg-slate-50 rounded px-1.5 py-1 mb-2 break-all">{component.propsDoc}</code>
        )}
        <div className="flex flex-wrap gap-1 mb-2">
          {component.domainTags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{tag}</span>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          {component.sourceLessonNumber
            ? `Proposed from lesson ${component.sourceLessonNumber} · ${fmtDate(component.createdAt)}`
            : component.sourceCourseId
            ? `Proposed at course-planning stage · ${fmtDate(component.createdAt)}`
            : `Starter component · ${fmtDate(component.createdAt)}`}
        </p>

        <button
          onClick={() => setShowCode((v) => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2 self-start"
        >
          <Code2 className="h-3 w-3" /> {showCode ? "Hide source" : "View source"}
        </button>
        {showCode && preview && (
          <pre className="text-[10px] bg-slate-900 text-slate-200 rounded-lg p-3 overflow-x-auto max-h-48 mb-3">{preview.code}</pre>
        )}

        <div className="flex gap-2 mt-auto pt-2 border-t border-slate-100">
          {component.status === "candidate" && (
            <>
              <button
                onClick={() => act("approve")}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
              </button>
              <button
                onClick={() => act("reject")}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
            </>
          )}
          {component.status === "active" && (
            <button
              onClick={() => act("reject")}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Remove from library
            </button>
          )}
          {component.status === "rejected" && (
            <>
              <button
                onClick={() => act("approve")}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
              </button>
              <button
                onClick={() => act("delete")}
                disabled={busy}
                className="flex items-center justify-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
