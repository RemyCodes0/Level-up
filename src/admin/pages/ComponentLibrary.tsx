"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, X, Trash2, RotateCcw, Loader2, Repeat, Sparkles, Code2, Percent } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, StatCard, Segmented, Chip,
  LoadingBlock, ErrorBlock, EmptyState, Pagination, fmtDate,
} from "../components";
import { SURFACE, cx } from "../theme";
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
    <Page>
      <PageHeader
        title="Component Library"
        sub="Reusable visual components grown from real lesson generation — review, preview, and approve before they're offered to future lessons."
        right={
          <Segmented
            value={tab}
            onChange={(k) => { setTab(k); setPage(1); }}
            options={TABS.map((t) => ({
              key: t.key,
              label: (
                <>
                  {t.label}
                  <span
                    className={cx(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      tab === t.key ? "bg-[#0A0B10]/20 text-[#0A0B10]" : "bg-white/[0.07] text-[#8A8FA3]"
                    )}
                  >
                    {counts[t.key] ?? "…"}
                  </span>
                </>
              ),
            }))}
          />
        }
      />

      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Repeat className="h-4 w-4" />}
            label="Total reuses"
            value={stats.totalReuses}
            sub="lesson calls to an existing component"
            accent="text-[#3DDC97]"
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="New components"
            value={stats.totalProposed}
            sub="distinct pieces ever proposed by real lessons"
            accent="text-[#B4A9FF]"
          />
          <StatCard
            icon={<Percent className="h-4 w-4" />}
            label="Reuse rate"
            value={stats.reuseRatePercent === null ? "—" : `${stats.reuseRatePercent}%`}
            sub="reuse events vs. new-component events"
            accent="text-[#FFB547]"
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
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {components.map((c) => (
              <ComponentCard key={c._id} component={c} onChanged={refreshAfterAction} />
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </>
      )}
    </Page>
  );
}

const ACTION_BTN =
  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors disabled:opacity-50 disabled:pointer-events-none";

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
    <div className={cx(SURFACE, "flex flex-col overflow-hidden transition-colors hover:ring-white/[0.14]")}>
      <div className="relative aspect-video bg-[#07080C]">
        {previewError ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-[#FF8A95]">{previewError}</div>
        ) : !preview ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#4A4F63]" />
          </div>
        ) : (
          <DynamicPlayer code={preview.code} durationInFrames={preview.durationInFrames} />
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#B4A9FF]" />
            <span className="truncate">{component.name}</span>
          </h3>
          {component.status === "active" && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#3DDC97]/10 px-2 py-0.5 text-[10px] font-medium text-[#3DDC97] ring-1 ring-inset ring-[#3DDC97]/25">
              <Repeat className="h-3 w-3" /> {component.usageCount} {component.usageCount === 1 ? "reuse" : "reuses"}
            </span>
          )}
        </div>

        <p className="mb-2.5 flex-1 text-[12px] leading-relaxed text-[#8A8FA3]">{component.description}</p>

        {component.propsDoc && (
          <code className="mb-2.5 block break-all rounded-lg bg-[#07080C] px-2 py-1.5 text-[10px] leading-relaxed text-[#6E7389] ring-1 ring-inset ring-white/[0.05]">
            {component.propsDoc}
          </code>
        )}

        {component.domainTags.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1">
            {component.domainTags.map((tag) => <Chip key={tag}>{tag}</Chip>)}
          </div>
        )}

        <p className="mb-3 text-[10px] text-[#4A4F63]">
          {component.sourceLessonNumber
            ? `Proposed from lesson ${component.sourceLessonNumber} · ${fmtDate(component.createdAt)}`
            : component.sourceCourseId
            ? `Proposed at course-planning stage · ${fmtDate(component.createdAt)}`
            : `Starter component · ${fmtDate(component.createdAt)}`}
        </p>

        <button
          onClick={() => setShowCode((v) => !v)}
          className="mb-2.5 flex items-center gap-1 self-start text-[11px] text-[#6E7389] transition-colors hover:text-[#D6D8E2]"
        >
          <Code2 className="h-3 w-3" /> {showCode ? "Hide source" : "View source"}
        </button>
        {showCode && preview && (
          <pre className="ad-scroll mb-3 max-h-48 overflow-auto rounded-xl bg-[#07080C] p-3 text-[10px] leading-relaxed text-[#B9BCCB] ring-1 ring-inset ring-white/[0.05]">
            {preview.code}
          </pre>
        )}

        <div className="mt-auto flex gap-2 border-t border-white/[0.06] pt-3">
          {component.status === "candidate" && (
            <>
              <button
                onClick={() => act("approve")}
                disabled={busy}
                className={cx(ACTION_BTN, "bg-[#3DDC97]/10 text-[#3DDC97] ring-[#3DDC97]/25 hover:bg-[#3DDC97]/20")}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
              </button>
              <button
                onClick={() => act("reject")}
                disabled={busy}
                className={cx(ACTION_BTN, "bg-[#FF5C6C]/10 text-[#FF8A95] ring-[#FF5C6C]/25 hover:bg-[#FF5C6C]/20")}
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
            </>
          )}
          {component.status === "active" && (
            <button
              onClick={() => act("reject")}
              disabled={busy}
              className={cx(ACTION_BTN, "bg-[#FF5C6C]/10 text-[#FF8A95] ring-[#FF5C6C]/25 hover:bg-[#FF5C6C]/20")}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Remove from library
            </button>
          )}
          {component.status === "rejected" && (
            <>
              <button
                onClick={() => act("approve")}
                disabled={busy}
                className={cx(ACTION_BTN, "bg-[#3DDC97]/10 text-[#3DDC97] ring-[#3DDC97]/25 hover:bg-[#3DDC97]/20")}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
              </button>
              <button
                onClick={() => act("delete")}
                disabled={busy}
                className="flex items-center justify-center gap-1 rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#6E7389] ring-1 ring-inset ring-white/[0.07] transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                title="Delete permanently"
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
