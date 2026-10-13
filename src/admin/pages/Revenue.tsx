"use client";

import { useEffect, useState } from "react";
import { Package, AlertTriangle } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, Card, RowList, Segmented, Bars,
  LoadingBlock, ErrorBlock, EmptyState, fmtUsd,
} from "../components";
import { EYEBROW } from "../theme";

interface RevenueData {
  range: string;
  totalUsd: number;
  purchaseCount: number;
  daily: { date: string; totalUsd: number; purchases: number }[];
  byPack: { packKey: string; label: string; count: number; totalUsd: number }[];
  allTime: { totalUsd: number; purchaseCount: number };
  caveats: { pricedAtCurrentRate: boolean; stripeOnly: boolean };
}

const RANGES = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export default function Revenue() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminApi
      .get<RevenueData>(`/api/admin/revenue?range=${range}`)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load revenue data."))
      .finally(() => setLoading(false));
  }, [range]);

  const packTotal = data?.byPack.reduce((s, p) => s + p.totalUsd, 0) || 0;
  const avgOrder = data && data.purchaseCount > 0 ? data.totalUsd / data.purchaseCount : 0;

  return (
    <Page>
      <PageHeader
        title="Revenue"
        sub="Real $ from credit-pack purchases — not an estimate, read straight from the credit ledger."
        right={<Segmented options={RANGES} value={range} onChange={setRange} />}
      />

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : data && (
        <>
          <div className="mb-5 overflow-hidden rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]">
            <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/[0.06] px-5 py-5">
              <div>
                <span className={EYEBROW}>Revenue · {data.range}</span>
                <div className="mt-1.5 ad-serif text-[44px] leading-none text-white">{fmtUsd(data.totalUsd)}</div>
              </div>
              <div className="flex gap-8">
                <Figure label="Purchases" value={data.purchaseCount.toLocaleString()} />
                <Figure label="Avg order" value={fmtUsd(avgOrder)} />
                <Figure label="All-time" value={fmtUsd(data.allTime.totalUsd)} sub={`${data.allTime.purchaseCount} purchases`} />
              </div>
            </div>
            <div className="px-5 py-5">
              {data.daily.length === 0 ? (
                <EmptyState label="purchases in this range" />
              ) : (
                <Bars
                  data={data.daily.map((d) => ({ label: d.date.slice(5), value: d.totalUsd, hint: `${d.purchases} purchase${d.purchases === 1 ? "" : "s"}` }))}
                  format={fmtUsd}
                  tone="amber"
                />
              )}
            </div>
          </div>

          <Card title="By credit pack" icon={<Package className="h-4 w-4" />} pad={false}>
            {data.byPack.length === 0 ? (
              <div className="p-5"><EmptyState label="purchases" /></div>
            ) : (
              <RowList>
                {data.byPack.map((p) => (
                  <div key={p.packKey} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[#ECEDF2]">{p.label}</p>
                        <p className="font-mono text-[11px] text-[#6E7389]">{p.packKey}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="block text-[13px] font-semibold tabular-nums text-white">{fmtUsd(p.totalUsd)}</span>
                        <span className="block text-[10px] tabular-nums text-[#6E7389]">{p.count} sold</span>
                      </div>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[#FFB547]"
                        style={{ width: `${packTotal > 0 ? Math.max(1.5, (p.totalUsd / packTotal) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </RowList>
            )}
          </Card>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#FFB547]/[0.06] px-4 py-3 text-[11px] leading-relaxed text-[#C9A876] ring-1 ring-inset ring-[#FFB547]/[0.15]">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-[#FFB547]" />
            <span>
              Two things this number doesn't capture: it's priced at each pack's <em>current</em> rate, not what was
              actually charged if a price has since changed, and it's Stripe purchases only — NotchPay payments grant
              credits through a separate path that doesn't write to this ledger, so they're not counted here yet.
            </span>
          </div>
        </>
      )}
    </Page>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <span className={EYEBROW}>{label}</span>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[#ECEDF2]">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-[#6E7389]">{sub}</div>}
    </div>
  );
}
