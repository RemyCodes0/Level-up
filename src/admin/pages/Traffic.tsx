"use client";

import { useEffect, useState } from "react";
import { Eye, Users2 } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, StatCard, LoadingBlock, ErrorBlock, EmptyState } from "../components";

interface PageViewStats {
  range: string;
  daily: { date: string; views: number; uniqueSessions: number }[];
  topPaths: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  totalUniqueSessions: number;
}

const RANGES = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export default function Traffic() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<PageViewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminApi
      .get<PageViewStats>(`/api/admin/pageviews?range=${range}`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load traffic data."))
      .finally(() => setLoading(false));
  }, [range]);

  const totalViews = data?.daily.reduce((s, d) => s + d.views, 0) || 0;
  const maxViews = Math.max(...(data?.daily.map((d) => d.views) || [0]), 1);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Traffic"
        sub="First-party page views — recorded directly from the app, not a third-party analytics dashboard."
        right={
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  range === r.key ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : data && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard icon={<Eye className="h-5 w-5" />} accent="text-indigo-500" label="Total views" value={totalViews} sub={data.range} />
            <StatCard icon={<Users2 className="h-5 w-5" />} accent="text-emerald-500" label="Unique visitors" value={data.totalUniqueSessions} sub={data.range} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Views per day</h3>
            {data.daily.length === 0 ? (
              <EmptyState label="page views" />
            ) : (
              <div className="flex items-end gap-1 h-32">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <div
                      className="w-full bg-emerald-400 rounded-t hover:bg-emerald-500 transition-colors"
                      style={{ height: `${Math.max(4, (d.views / maxViews) * 100)}%` }}
                      title={`${d.date}: ${d.views} views, ${d.uniqueSessions} unique`}
                    />
                    <span className="text-[9px] text-slate-400 whitespace-nowrap">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Top pages</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {data.topPaths.length === 0 ? (
                  <EmptyState label="page data" />
                ) : data.topPaths.map((p) => (
                  <div key={p.path} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-slate-700 truncate font-mono">{p.path}</span>
                    <span className="text-sm font-semibold text-slate-900 shrink-0 ml-3">{p.views}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Top referrers</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {data.topReferrers.length === 0 ? (
                  <EmptyState label="referrer data" />
                ) : data.topReferrers.map((r) => (
                  <div key={r.referrer} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-slate-700 truncate">{r.referrer}</span>
                    <span className="text-sm font-semibold text-slate-900 shrink-0 ml-3">{r.views}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
