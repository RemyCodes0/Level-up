"use client";

import { useEffect, useState } from "react";
import {
  Search, Trash2, Pencil, Loader2, Activity, CheckCircle2, Circle, Coins, BadgeCheck,
  ArrowUp, ArrowDown, ArrowUpDown, Film, Gift, Ticket, Mail,
} from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, Card, Modal, LoadingBlock, ErrorBlock, EmptyState, fmtDate, fmtPosition,
} from "../components";
import { INPUT, LABEL, BTN_PRIMARY, BTN_MINT, BTN_DANGER, EYEBROW, cx } from "../theme";

interface User {
  _id: string;
  name: string;
  email: string;
  verified: boolean;
  courseCredits: number;
  signupBonusCredits?: number;
  signupBonusExpiresAt?: string | null;
  createdAt: string;
  // Added alongside this richer view — see authController.js's getUsers.
  authProvider?: "local" | "google";
  freeTrialUsed?: boolean;
  referralCount?: number;
  referralCreditsEarned?: number;
  emailUnsubscribed?: boolean;
  // Aggregated server-side from the Course collection, not stored on the
  // user document itself — real counts, not an estimate.
  courseCount?: number;
}

// Mirrors creditService.js's getSpendableBalance — the signup bonus only
// counts while unexpired. Admins should see (and adjust against) the same
// number the user's own dashboard shows, not the raw courseCredits field
// alone, which was the old behavior here and undercounted anyone still
// sitting on signup-bonus credits.
function spendableBalance(u: User): number {
  const bonusValid = !!u.signupBonusExpiresAt && new Date(u.signupBonusExpiresAt).getTime() > Date.now();
  return (bonusValid ? u.signupBonusCredits || 0 : 0) + (u.courseCredits || 0);
}

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Deterministic accent per user, so the same person keeps the same colour. */
const AVATAR_TINTS = ["#8B7CFF", "#FF7A45", "#3DDC97", "#FFB547", "#FF5C6C"];
function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

type SortKey = "name" | "createdAt" | "courseCount" | "referralCount" | "credits";

const SORT_VALUE: Record<SortKey, (u: User) => number | string> = {
  name: (u) => (u.name || "").toLowerCase(),
  createdAt: (u) => new Date(u.createdAt).getTime(),
  courseCount: (u) => u.courseCount || 0,
  referralCount: (u) => u.referralCount || 0,
  credits: (u) => spendableBalance(u),
};

/**
 * A clickable column header that sorts by `sortKey`. Clicking the already-
 * active column flips direction instead of resetting it, same convention
 * as every other sortable-table UI — clicking "Joined" twice in a row
 * should flip oldest/newest, not silently do nothing the second time.
 */
function SortableTh({
  label, sortKey, active, dir, onSort, align = "left",
}: { label: string; sortKey: SortKey; active: boolean; dir: "asc" | "desc"; onSort: (k: SortKey) => void; align?: "left" | "right" }) {
  return (
    <th className={cx(EYEBROW, "px-5 py-3", align === "right" ? "text-right" : "text-left")}>
      <button
        onClick={() => onSort(sortKey)}
        className={cx(
          "group/sort inline-flex items-center gap-1 transition-colors hover:text-[#D6D8E2]",
          align === "right" && "flex-row-reverse",
          active && "text-[#B4A9FF]"
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover/sort:opacity-40" />
        )}
      </button>
    </th>
  );
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewingProgress, setViewingProgress] = useState<User | null>(null);
  const [adjustingCredits, setAdjustingCredits] = useState<User | null>(null);
  // Default: newest account first (explicit request, 2026-10-18 — was
  // oldest-first before). The server already returns users sorted this way
  // (see getUsers' explicit sort({createdAt:-1})), so this default doesn't
  // even need a client-side re-sort on first load, only once the admin
  // clicks a different column.
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // First click on a new column picks the direction that's actually
    // useful to see first: newest-first for "Joined" (matches the default
    // above), A→Z for "Name", but highest-first for every numeric metric —
    // nobody clicks "Credits" wanting to see the $0 accounts.
    setSortDir(key === "name" ? "asc" : "desc");
  };

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi
      .get<{ user: User[] }>("/api/auth/getUsers")
      .then((res) => setUsers(res.user))
      .catch((err) => setError(err.message || "Failed to load users."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this user permanently? This can't be undone.")) return;
    try {
      await adminApi.delete(`/api/auth/${id}/delete`);
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete user.");
    }
  };

  const filtered = users.filter(
    (u) => u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getSortValue = SORT_VALUE[sortKey];
  const sorted = [...filtered].sort((a, b) => {
    const av = getSortValue(a);
    const bv = getSortValue(b);
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const verifiedCount = users.filter((u) => u.verified).length;
  const totalCourses = users.reduce((sum, u) => sum + (u.courseCount || 0), 0);

  return (
    <Page>
      <PageHeader
        title="Users"
        sub={`${users.length} accounts · ${verifiedCount} verified · ${totalCourses} courses generated`}
        right={
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A4F63]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className={cx(INPUT, "pl-10")}
            />
          </div>
        }
      />

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : (
        <Card pad={false}>
          {sorted.length === 0 ? (
            <div className="p-5">
              <EmptyState label={search ? "matching users" : "users"} />
            </div>
          ) : (
            <div className="ad-scroll overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                    <SortableTh label="User" sortKey="name" active={sortKey === "name"} dir={sortDir} onSort={handleSort} />
                    <SortableTh label="Joined" sortKey="createdAt" active={sortKey === "createdAt"} dir={sortDir} onSort={handleSort} />
                    <th className={cx(EYEBROW, "px-5 py-3 text-left")}>Status</th>
                    <SortableTh label="Courses" sortKey="courseCount" active={sortKey === "courseCount"} dir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Referrals" sortKey="referralCount" active={sortKey === "referralCount"} dir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Credits" sortKey="credits" active={sortKey === "credits"} dir={sortDir} onSort={handleSort} align="right" />
                    <th className="w-36 px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sorted.map((u) => (
                    <tr key={u._id} className="group transition-colors hover:bg-white/[0.025]">
                      <td className="px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1"
                            style={{
                              background: `${tintFor(u._id)}1F`,
                              color: tintFor(u._id),
                              borderColor: "transparent",
                              boxShadow: `inset 0 0 0 1px ${tintFor(u._id)}40`,
                            }}
                          >
                            {initials(u.name)}
                          </span>
                          <div className="min-w-0">
                            <button
                              onClick={() => setViewingProgress(u)}
                              title="View their generated courses"
                              className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[#ECEDF2] hover:text-[#B4A9FF] hover:underline"
                            >
                              {u.name}
                              {u.authProvider === "google" && (
                                <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-[#8A8FA3]" title="Signed up with Google">
                                  Google
                                </span>
                              )}
                            </button>
                            <p className="truncate text-[11px] text-[#6E7389]">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[11px] text-[#6E7389]">{fmtDate(u.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          {u.verified ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#3DDC97]">
                              <BadgeCheck className="h-3.5 w-3.5" /> Verified
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#6E7389]">Unverified</span>
                          )}
                          <div className="flex items-center gap-2.5">
                            {u.freeTrialUsed && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-[#6E7389]" title="Has used their signup bonus credits">
                                <Ticket className="h-3 w-3" /> Trial used
                              </span>
                            )}
                            {u.emailUnsubscribed && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-[#FFB547]" title="Opted out of broadcast emails">
                                <Mail className="h-3 w-3" /> Unsubscribed
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center justify-end gap-1.5 text-[13px] text-[#D6D8E2] tabular-nums">
                          <Film className="h-3.5 w-3.5 text-[#6E7389]" /> {u.courseCount ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {u.referralCount ? (
                          <span className="inline-flex items-center justify-end gap-1.5 text-[13px] text-[#D6D8E2] tabular-nums" title={`${u.referralCreditsEarned ?? 0} credits earned from referrals`}>
                            <Gift className="h-3.5 w-3.5 text-[#6E7389]" /> {u.referralCount}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#4A4F63]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-[13px] font-semibold tabular-nums text-white">{spendableBalance(u)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                          <RowAction onClick={() => setViewingProgress(u)} title="View course progress" hover="#3DDC97">
                            <Activity className="h-3.5 w-3.5" />
                          </RowAction>
                          <RowAction onClick={() => setAdjustingCredits(u)} title="Add or remove credits" hover="#FFB547">
                            <Coins className="h-3.5 w-3.5" />
                          </RowAction>
                          <RowAction onClick={() => setEditing(u)} title="Edit user" hover="#B4A9FF">
                            <Pencil className="h-3.5 w-3.5" />
                          </RowAction>
                          <RowAction onClick={() => handleDelete(u._id)} title="Delete user" hover="#FF8A95">
                            <Trash2 className="h-3.5 w-3.5" />
                          </RowAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => (u._id === updated._id ? { ...u, ...updated } : u)));
            setEditing(null);
          }}
        />
      )}

      {viewingProgress && (
        <UserProgressModal
          userId={viewingProgress._id}
          userName={viewingProgress.name}
          onClose={() => setViewingProgress(null)}
        />
      )}

      {adjustingCredits && (
        <AdjustCreditsModal
          user={adjustingCredits}
          onClose={() => setAdjustingCredits(null)}
          onAdjusted={(updated) => {
            setUsers((prev) => prev.map((u) => (u._id === updated._id ? { ...u, ...updated } : u)));
            setAdjustingCredits(null);
          }}
        />
      )}
    </Page>
  );
}

/** Icon button whose hover colour is set per action, via a CSS variable. */
function RowAction({
  onClick, title, hover, children,
}: { onClick: () => void; title: string; hover: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-white/[0.06] hover:text-[var(--ad-hover)]"
      style={{ "--ad-hover": hover } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

interface LessonProgressRow {
  lessonNumber: number;
  title: string;
  totalFrames: number | null;
  watched: boolean;
  watchedAt: string | null;
  replayCount: number;
  lastPositionFrame: number;
  lastPlayedAt: string | null;
}

interface CourseProgressRow {
  courseId: string;
  topic: string;
  completedAt: string | null;
  lessons: LessonProgressRow[];
}

function UserProgressModal({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const [courses, setCourses] = useState<CourseProgressRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminApi
      .get<{ user: { _id: string; name: string; email: string }; courses: CourseProgressRow[] }>(
        `/api/admin/users/${userId}/progress`
      )
      .then((res) => setCourses(res.courses))
      .catch((err) => setError(err.message || "Failed to load progress."))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <Modal title={`${userName}'s progress`} sub="Watch state across every course they own" onClose={onClose}>
      <div className="p-6">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={error} />
        ) : !courses || courses.length === 0 ? (
          <EmptyState label="courses" />
        ) : (
          <div className="space-y-4">
            {courses.map((c) => {
              const watched = c.lessons.filter((l) => l.watched).length;
              return (
                <div key={c.courseId} className="overflow-hidden rounded-2xl ring-1 ring-white/[0.07]">
                  <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <span className="min-w-0 truncate text-[13px] font-medium text-[#ECEDF2]">{c.topic}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] tabular-nums text-[#6E7389]">{watched}/{c.lessons.length} watched</span>
                      {c.completedAt && (
                        <span className="rounded-full bg-[#3DDC97]/10 px-2 py-0.5 text-[10px] font-medium text-[#3DDC97] ring-1 ring-inset ring-[#3DDC97]/25">
                          Completed {fmtDate(c.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {c.lessons
                      .slice()
                      .sort((a, b) => a.lessonNumber - b.lessonNumber)
                      .map((l) => (
                        <div key={l.lessonNumber} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {l.watched ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#3DDC97]" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-white/[0.14]" />
                            )}
                            <span className="truncate text-[13px] text-[#D6D8E2]">
                              <span className="font-mono text-[11px] text-[#4A4F63]">{String(l.lessonNumber).padStart(2, "0")}</span>{" "}
                              {l.title}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3 text-[11px] text-[#6E7389]">
                            {l.watchedAt && <span className="hidden sm:inline">watched {fmtDate(l.watchedAt)}</span>}
                            {l.lastPositionFrame > 0 && (
                              <span className="font-medium tabular-nums text-[#8A8FA3]">
                                {fmtPosition(l.lastPositionFrame, l.totalFrames)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (u: Partial<User> & { _id: string }) => void }) {
  const [name, setName] = useState(user.name);
  const [verified, setVerified] = useState(user.verified);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Credits are deliberately NOT editable here — see AdjustCreditsModal
  // below (the Coins icon action). That path goes through creditService.js's
  // grantCredits/spendCredits, which leaves a CreditTransaction ledger row
  // and can't push a balance negative; a raw PATCH here would silently
  // overwrite courseCredits with no record of who changed it or why, and
  // wouldn't touch the separate signup-bonus bucket at all.
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.patch<any>(`/api/auth/${user._id}/admin`, { name, verified });
      onSaved(updated);
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit user" sub={user.email} onClose={onClose} width="sm">
      <div className="p-6">
        <label className={LABEL}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl bg-white/[0.03] px-3.5 py-3 text-[13px] text-[#D6D8E2] ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.06]">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="h-4 w-4 rounded" />
          Email verified
        </label>

        <p className="mt-3 text-[11px] leading-relaxed text-[#4A4F63]">
          Credits aren't editable here — use the Coins action so the change lands in the ledger.
        </p>

        {error && <p className="mt-3 text-[11px] text-[#FF8A95]">{error}</p>}
        <button onClick={handleSave} disabled={saving} className={cx(BTN_PRIMARY, "mt-5 w-full")}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </div>
    </Modal>
  );
}

function AdjustCreditsModal({ user, onClose, onAdjusted }: { user: User; onClose: () => void; onAdjusted: (u: Partial<User> & { _id: string }) => void }) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentBalance = spendableBalance(user);
  const parsedAmount = Number(amount);
  const validAmount = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const nextBalance = direction === "add" ? currentBalance + parsedAmount : Math.max(0, currentBalance - parsedAmount);

  const handleSubmit = async () => {
    if (!validAmount) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminApi.post<{ user: Partial<User> & { _id: string } }>(
        `/api/admin/users/${user._id}/credits`,
        { amount: parsedAmount, direction, reason: reason.trim() || undefined }
      );
      onAdjusted(res.user);
    } catch (err: any) {
      setError(err.message || "Failed to adjust credits.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Adjust credits" sub={user.name} onClose={onClose} width="sm">
      <div className="p-6">
        <div className="mb-5 flex items-end justify-between rounded-2xl bg-white/[0.03] px-4 py-3.5 ring-1 ring-inset ring-white/[0.06]">
          <div>
            <span className={EYEBROW}>Balance now</span>
            <div className="mt-1 text-2xl font-semibold leading-none text-white tabular-nums">{currentBalance}</div>
          </div>
          {validAmount && (
            <div className="text-right">
              <span className={EYEBROW}>After</span>
              <div
                className="mt-1 text-2xl font-semibold leading-none tabular-nums"
                style={{ color: direction === "add" ? "#3DDC97" : "#FF8A95" }}
              >
                {nextBalance}
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-[#0C0D13] p-1 ring-1 ring-white/[0.07]">
          <button
            type="button"
            onClick={() => setDirection("add")}
            className={cx(
              "rounded-lg py-2 text-[13px] font-semibold transition-all",
              direction === "add" ? "bg-[#3DDC97] text-[#0A0B10]" : "text-[#8A8FA3] hover:bg-white/[0.05] hover:text-white"
            )}
          >
            + Add
          </button>
          <button
            type="button"
            onClick={() => setDirection("remove")}
            className={cx(
              "rounded-lg py-2 text-[13px] font-semibold transition-all",
              direction === "remove" ? "bg-[#FF5C6C] text-[#0A0B10]" : "text-[#8A8FA3] hover:bg-white/[0.05] hover:text-white"
            )}
          >
            − Remove
          </button>
        </div>

        <label className={LABEL}>Amount</label>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 50"
          className={INPUT}
          autoFocus
        />

        <label className={cx(LABEL, "mt-4")}>Reason — kept in the ledger</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. goodwill credit, refund correction"
          className={INPUT}
        />

        {error && <p className="mt-3 text-[11px] text-[#FF8A95]">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={saving || !validAmount}
          className={cx(direction === "add" ? BTN_MINT : BTN_DANGER, "mt-5 w-full")}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {direction === "add" ? "Add credits" : "Remove credits"}
        </button>
      </div>
    </Modal>
  );
}
