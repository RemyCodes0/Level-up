"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users2, Gift, TrendingUp, Trophy } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, StatCard, Card, RowList, ROW_HOVER,
  LoadingBlock, ErrorBlock, EmptyState, fmtDate,
} from "../components";
import { cx } from "../theme";

interface ReferralLeaderboardRow {
  _id: string;
  name: string;
  email: string;
  referralCode?: string;
  referralCount: number;
  referralCreditsEarned: number;
  createdAt: string;
}

interface ReferralStats {
  totalUsers: number;
  totalReferred: number;
  conversionRate: number;
  totalCreditsGranted: number;
  leaderboard: ReferralLeaderboardRow[];
}

/** Deterministic accent per user — same hash as Users.tsx's own tintFor. */
const TINTS = ["#8B7CFF", "#FF7A45", "#3DDC97", "#FFB547", "#FF5C6C"];
function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
function initials(name: string): string {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export default function Referrals() {
  const [data, setData] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .get<ReferralStats>("/api/admin/referrals")
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load referral stats."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Page><LoadingBlock /></Page>;
  if (error) return <Page><ErrorBlock message={error} /></Page>;
  if (!data) return null;

  const topCount = data.leaderboard[0]?.referralCount || 1;

  return (
    <Page>
      <PageHeader
        title="Referrals"
        sub="Who's actually bringing people in, and what the program has paid out for it."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Users2 className="h-4 w-4" />}
          accent="text-[#B4A9FF]"
          label="Referred signups"
          value={data.totalReferred.toLocaleString()}
          sub={`of ${data.totalUsers.toLocaleString()} total users`}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-[#3DDC97]"
          label="Conversion rate"
          value={`${data.conversionRate}%`}
          sub="of all users came via referral"
        />
        <StatCard
          icon={<Gift className="h-4 w-4" />}
          accent="text-[#FFB547]"
          label="Credits granted"
          value={data.totalCreditsGranted.toLocaleString()}
          sub="total program cost, in credits"
        />
        <StatCard
          icon={<Trophy className="h-4 w-4" />}
          accent="text-[#FF7A45]"
          label="Active referrers"
          value={data.leaderboard.length.toLocaleString()}
          sub="users with at least 1 referral"
        />
      </div>

      <Card title="Leaderboard" icon={<Trophy className="h-4 w-4" />} pad={false}>
        {data.leaderboard.length === 0 ? (
          <div className="p-5"><EmptyState label="referrals yet" /></div>
        ) : (
          <RowList>
            {data.leaderboard.map((u, i) => (
              <Link
                key={u._id}
                to={`/admin/users`}
                className={cx("flex items-center gap-3 px-5 py-3", ROW_HOVER)}
                title="Open Users to find this account"
              >
                <span
                  className={cx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold",
                    i === 0 ? "bg-[#FFB547]/20 text-[#FFB547]" : i === 1 ? "bg-white/[0.1] text-[#D6D8E2]" : i === 2 ? "bg-[#FF7A45]/15 text-[#FF7A45]" : "text-[#4A4F63]"
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1"
                  style={{ background: `${tintFor(u._id)}1F`, color: tintFor(u._id), boxShadow: `inset 0 0 0 1px ${tintFor(u._id)}40` }}
                >
                  {initials(u.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#ECEDF2]">{u.name}</p>
                  <p className="truncate text-[11px] text-[#6E7389]">{u.email} · joined {fmtDate(u.createdAt)}</p>
                </div>
                <div className="hidden w-28 shrink-0 sm:block">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[#8B7CFF]"
                      style={{ width: `${Math.max(4, (u.referralCount / topCount) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-[13px] font-semibold tabular-nums text-white">{u.referralCount} referred</span>
                  <span className="block text-[10px] tabular-nums text-[#6E7389]">+{u.referralCreditsEarned} credits</span>
                </div>
              </Link>
            ))}
          </RowList>
        )}
      </Card>
    </Page>
  );
}
