"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState, fmtUsd } from "../components";

interface AiUsage {
  range: string;
  daily: { date: string; totalUsd: number; calls: number }[];
  topCourses: { courseId: string; totalUsd: number; calls: number; topic: string | null }[];
  byModel: { model: string; totalUsd: number; calls: number }[];
}

const RANGES = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export default function AiSpend() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminApi
      .get<AiUsage>(`/api/admin/ai-usage?range=${range}`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load AI usage."))
      .finally(() => setLoading(false));
  }, [range]);

  const totalUsd = data?.daily.reduce((s, d) => s + d.totalUsd, 0) || 0;
  const maxDaily = Math.max(...(data?.daily.map((d) => d.totalUsd) || [0]), 0.0001);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="AI Spend"
        sub="Real $ cost per generation call, computed from token usage at write time."
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
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-slate-400" /> Total spend ({data.range})
              </h3>
              <span className="text-2xl font-bold text-slate-900">{fmtUsd(totalUsd)}</span>
            </div>
            {data.daily.length === 0 ? (
              <EmptyState label="usage data" />
            ) : (
              <div className="flex items-end gap-1 h-32">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                    <div
                      className="w-full bg-indigo-400 rounded-t hover:bg-indigo-500 transition-colors"
                      style={{ height: `${Math.max(4, (d.totalUsd / maxDaily) * 100)}%` }}
                      title={`${d.date}: ${fmtUsd(d.totalUsd)} (${d.calls} calls)`}
                    />
                    <span className="text-[9px] text-slate-400 rotate-0 whitespace-nowrap">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">By model</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {data.byModel.length === 0 ? (
                  <EmptyState label="model usage" />
                ) : data.byModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate font-mono">{m.model}</p>
                      <p className="text-xs text-slate-400">{m.calls} calls</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 shrink-0 ml-3">{fmtUsd(m.totalUsd)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Most expensive courses</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {data.topCourses.length === 0 ? (
                  <EmptyState label="course costs" />
                ) : data.topCourses.map((c) => (
                  <Link key={c.courseId} to={`/admin/courses/${c.courseId}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.topic || "Untitled"}</p>
                      <p className="text-xs text-slate-400">{c.calls} calls</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 shrink-0 ml-3">{fmtUsd(c.totalUsd)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
