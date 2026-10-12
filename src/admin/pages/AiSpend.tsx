"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, Cpu, Flame } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, Card, RowList, ROW_HOVER, Segmented, Bars,
  LoadingBlock, ErrorBlock, EmptyState, fmtUsd,
} from "../components";
import { EYEBROW, cx } from "../theme";

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
  const totalCalls = data?.daily.reduce((s, d) => s + d.calls, 0) || 0;
  const perCall = totalCalls > 0 ? totalUsd / totalCalls : 0;
  const modelTotal = data?.byModel.reduce((s, m) => s + m.totalUsd, 0) || 0;

  return (
    <Page>
      <PageHeader
        title="AI Spend"
        sub="Real $ cost per generation call, computed from token usage at write time."
        right={<Segmented options={RANGES} value={range} onChange={setRange} />}
      />

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : data && (
        <>
          <div className="mb-5 overflow-hidden rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]">
            <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/[0.06] px-5 py-5">
              <div>
                <span className={EYEBROW}>Total spend · {data.range}</span>
                <div className="mt-1.5 ad-serif text-[44px] leading-none text-white">{fmtUsd(totalUsd)}</div>
              </div>
              <div className="flex gap-8">
                <Figure label="Calls" value={totalCalls.toLocaleString()} />
                <Figure label="Avg / call" value={fmtUsd(perCall)} />
              </div>
            </div>
            <div className="px-5 py-5">
              {data.daily.length === 0 ? (
                <EmptyState label="usage data" />
              ) : (
                <Bars
                  data={data.daily.map((d) => ({ label: d.date.slice(5), value: d.totalUsd, hint: `${d.calls} calls` }))}
                  format={fmtUsd}
                  tone="iris"
                />
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="By model" icon={<Cpu className="h-4 w-4" />} pad={false}>
              {data.byModel.length === 0 ? (
                <div className="p-5"><EmptyState label="model usage" /></div>
              ) : (
                <RowList>
                  {data.byModel.map((m) => (
                    <div key={m.model} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-mono text-[12px] text-[#ECEDF2]">{m.model}</p>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-white">{fmtUsd(m.totalUsd)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-[#8B7CFF]"
                            style={{ width: `${modelTotal > 0 ? Math.max(1.5, (m.totalUsd / modelTotal) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[10px] tabular-nums text-[#6E7389]">{m.calls} calls</span>
                      </div>
                    </div>
                  ))}
                </RowList>
              )}
            </Card>

            <Card title="Most expensive courses" icon={<Flame className="h-4 w-4" />} pad={false}>
              {data.topCourses.length === 0 ? (
                <div className="p-5"><EmptyState label="course costs" /></div>
              ) : (
                <RowList>
                  {data.topCourses.map((c, i) => (
                    <Link
                      key={c.courseId}
                      to={`/admin/courses/${c.courseId}`}
                      className={cx("flex items-center gap-3 px-5 py-3", ROW_HOVER)}
                    >
                      <span className="w-4 shrink-0 font-mono text-[11px] text-[#4A4F63]">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[#ECEDF2]">{c.topic || "Untitled"}</p>
                        <p className="text-[11px] text-[#6E7389]">{c.calls} calls</p>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-white">{fmtUsd(c.totalUsd)}</span>
                    </Link>
                  ))}
                </RowList>
              )}
            </Card>
          </div>

          <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-[#4A4F63]">
            <DollarSign className="mt-px h-3.5 w-3.5 shrink-0" />
            LLM calls carry OpenRouter's own billed amount; TTS is a per-character estimate, since the
            provider returns no cost field. Open a course to see its real/estimated split.
          </p>
        </>
      )}
    </Page>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className={EYEBROW}>{label}</span>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[#ECEDF2]">{value}</div>
    </div>
  );
}
