"use client";

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, BadgeCheck, Film, Gift, Coins, Mail, Ticket, Award, GitBranch,
} from "lucide-react";
import { adminApi } from "../adminApi";
import { Page, PageHeader, Card, RowList, ROW_HOVER, StatusBadge, Chip, LoadingBlock, ErrorBlock, EmptyState, fmtDate } from "../components";
import { EYEBROW, cx } from "../theme";
import { spendableBalance, type User } from "../userTypes";

interface UserCourse {
  _id: string;
  topic: string;
  status: string;
  isFreeTrial: boolean;
  lessonsReady: number;
  lessonsFailed: number;
  lessonsTotal: number;
  createdAt: string;
  parentCourseId: string | null;
  followUpKind: "repair" | "extend" | null;
  latestQuiz: { score: number; total: number; pct: number; submittedAt: string } | null;
}

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<UserCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    setError(null);
    adminApi
      .get<{ user: User; courses: UserCourse[] }>(`/api/admin/users/${userId}/courses`)
      .then((res) => { setUser(res.user); setCourses(res.courses); })
      .catch((err) => setError(err.message || "Failed to load this user."))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Page><LoadingBlock /></Page>;
  if (error || !user) return <Page><ErrorBlock message={error || "User not found."} /></Page>;

  const balance = spendableBalance(user);
  const parentOf = new Map(courses.filter((c) => c.parentCourseId).map((c) => [c.parentCourseId as string, c]));

  return (
    <Page max="7xl">
      <Link to="/admin/users" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#B4A9FF] transition-colors hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> All users
      </Link>

      <div className="mb-7 flex flex-wrap items-center gap-4 border-b border-white/[0.06] pb-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#8B7CFF]/15 text-xl font-bold text-[#B4A9FF] ring-1 ring-[#8B7CFF]/30">
          {initials(user.name)}
        </span>
        <div className="min-w-0">
          <h1 className="ad-serif flex items-center gap-2 text-[28px] leading-tight text-white">
            {user.name}
            {user.authProvider === "google" && (
              <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-[#8A8FA3]">Google</span>
            )}
          </h1>
          <p className="text-[13px] text-[#8A8FA3]">{user.email}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {user.verified ? (
            <Chip><span className="inline-flex items-center gap-1 text-[#3DDC97]"><BadgeCheck className="h-3 w-3" /> Verified</span></Chip>
          ) : (
            <Chip>Unverified</Chip>
          )}
          {user.freeTrialUsed && <Chip><span className="inline-flex items-center gap-1"><Ticket className="h-3 w-3" /> Trial used</span></Chip>}
          {user.emailUnsubscribed && <Chip tone="danger"><span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Unsubscribed</span></Chip>}
        </div>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.06] sm:grid-cols-4">
        <Stat icon={<Coins className="h-3.5 w-3.5" />} label="Credit balance" value={balance} />
        <Stat icon={<Film className="h-3.5 w-3.5" />} label="Courses generated" value={courses.length} />
        <Stat icon={<Gift className="h-3.5 w-3.5" />} label="Referrals" value={user.referralCount || 0} sub={user.referralCreditsEarned ? `${user.referralCreditsEarned} credits earned` : undefined} />
        <Stat label="Joined" value={fmtDate(user.createdAt)} />
      </div>

      <PageHeader title="Courses" sub="Every course this user has generated, newest first." />

      {courses.length === 0 ? (
        <Card pad={false}><div className="p-5"><EmptyState label="courses" /></div></Card>
      ) : (
        <Card pad={false}>
          <RowList>
            {courses.map((c) => {
              const followUp = c.parentCourseId ? courses.find((p) => p._id === c.parentCourseId) : null;
              const child = parentOf.get(c._id);
              return (
                <button
                  key={c._id}
                  onClick={() => navigate(`/admin/courses/${c._id}`)}
                  className={cx("flex w-full items-center gap-4 px-5 py-3.5 text-left", ROW_HOVER)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#ECEDF2]">{c.topic || "Untitled"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#6E7389]">
                      {fmtDate(c.createdAt)}
                      {(followUp || child) && (
                        <span className="inline-flex items-center gap-1 text-[#8B7CFF]">
                          <GitBranch className="h-3 w-3" />
                          {followUp ? `${c.followUpKind === "repair" ? "Repair of" : "Follow-up of"} "${followUp.topic}"` : "Has a follow-up"}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {c.isFreeTrial && <Chip>trial</Chip>}
                    {c.latestQuiz && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B4A9FF]" title={`Quiz: ${c.latestQuiz.score}/${c.latestQuiz.total}`}>
                        <Award className="h-3.5 w-3.5" /> {Math.round(c.latestQuiz.pct)}%
                      </span>
                    )}
                    <span className="text-[11px] tabular-nums text-[#6E7389]">{c.lessonsReady}/{c.lessonsTotal}</span>
                    <StatusBadge status={c.status} />
                  </div>
                </button>
              );
            })}
          </RowList>
        </Card>
      )}
    </Page>
  );
}

function Stat({ icon, label, value, sub }: { icon?: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[#0E1016] px-5 py-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-[#6E7389]">{icon}</span>}
        <span className={EYEBROW}>{label}</span>
      </div>
      <div className="mt-1.5 text-xl font-semibold leading-none text-white tabular-nums">{value}</div>
      {sub && <p className="mt-1 text-[11px] text-[#6E7389]">{sub}</p>}
    </div>
  );
}
