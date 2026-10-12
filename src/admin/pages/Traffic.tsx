"use client";

import { useEffect, useState } from "react";
import { Eye, Users2, FileText, ExternalLink } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, StatCard, Card, RowList, Segmented, Bars,
  LoadingBlock, ErrorBlock, EmptyState,
} from "../components";

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
  const perVisitor = data && data.totalUniqueSessions > 0 ? totalViews / data.totalUniqueSessions : 0;

  return (
    <Page>
      <PageHeader
        title="Traffic"
        sub="First-party page views — recorded directly from the app, not a third-party analytics dashboard."
        right={<Segmented options={RANGES} value={range} onChange={setRange} />}
      />

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard icon={<Eye className="h-4 w-4" />} accent="text-[#B4A9FF]" label="Total views" value={totalViews.toLocaleString()} sub={data.range} />
            <StatCard icon={<Users2 className="h-4 w-4" />} accent="text-[#3DDC97]" label="Unique visitors" value={data.totalUniqueSessions.toLocaleString()} sub={data.range} />
            <StatCard
              icon={<FileText className="h-4 w-4" />}
              accent="text-[#FFB547]"
              label="Views / visitor"
              value={perVisitor > 0 ? perVisitor.toFixed(1) : "—"}
              sub="how deep a session goes"
            />
          </div>

          <div className="mb-5">
            <Card title="Views per day" icon={<Eye className="h-4 w-4" />}>
              {data.daily.length === 0 ? (
                <EmptyState label="page views" />
              ) : (
                <Bars
                  data={data.daily.map((d) => ({ label: d.date.slice(5), value: d.views, hint: `${d.uniqueSessions} unique` }))}
                  format={(v) => v.toLocaleString()}
                  tone="mint"
                />
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Top pages" icon={<FileText className="h-4 w-4" />} pad={false}>
              {data.topPaths.length === 0 ? (
                <div className="p-5"><EmptyState label="page data" /></div>
              ) : (
                <RowList>
                  {data.topPaths.map((p) => (
                    <Row key={p.path} label={p.path} value={p.views} max={data.topPaths[0].views} mono />
                  ))}
                </RowList>
              )}
            </Card>

            <Card title="Top referrers" icon={<ExternalLink className="h-4 w-4" />} pad={false}>
              {data.topReferrers.length === 0 ? (
                <div className="p-5"><EmptyState label="referrer data" /></div>
              ) : (
                <RowList>
                  {data.topReferrers.map((r) => (
                    <Row key={r.referrer} label={r.referrer} value={r.views} max={data.topReferrers[0].views} />
                  ))}
                </RowList>
              )}
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}

/**
 * A ranked row with the share-of-top bar drawn behind the label — the same
 * trick the AI Spend page's "by model" list uses, so the two read alike.
 */
function Row({ label, value, max, mono }: { label: string; value: number; max: number; mono?: boolean }) {
  return (
    <div className="relative px-5 py-2.5">
      <span
        className="pointer-events-none absolute inset-y-0 left-0 bg-[#8B7CFF]/[0.07]"
        style={{ width: `${max > 0 ? Math.max(1, (value / max) * 100) : 0}%` }}
        aria-hidden="true"
      />
      <div className="relative flex items-center justify-between gap-3">
        <span className={`min-w-0 truncate text-[13px] text-[#D6D8E2] ${mono ? "font-mono text-[12px]" : ""}`}>{label}</span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-white">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}
