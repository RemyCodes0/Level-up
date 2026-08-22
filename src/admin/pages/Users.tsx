"use client";

import { useEffect, useState } from "react";
import { Search, Trash2, Pencil, X, Loader2, Activity, CheckCircle2, Circle, Coins } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState, fmtDate, fmtPosition } from "../components";

interface User {
  _id: string;
  name: string;
  email: string;
  role: "learner" | "tutor";
  verified: boolean;
  courseCredits: number;
  signupBonusCredits?: number;
  signupBonusExpiresAt?: string | null;
  createdAt: string;
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

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewingProgress, setViewingProgress] = useState<User | null>(null);
  const [adjustingCredits, setAdjustingCredits] = useState<User | null>(null);

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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader title="Users" sub={`${users.length} total`} />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} /> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8"><EmptyState label="users" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Verified</th>
                  <th className="px-5 py-3 font-medium">Credits</th>
                  <th className="px-5 py-3 font-medium w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{u.name}</td>
                    <td className="px-5 py-3 text-slate-500">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{u.role}</span>
                    </td>
                    <td className="px-5 py-3">
                      {u.verified ? <span className="text-xs text-emerald-600">Yes</span> : <span className="text-xs text-slate-400">No</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{spendableBalance(u)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setViewingProgress(u)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="View course progress">
                          <Activity className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setAdjustingCredits(u)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Add or remove credits">
                          <Coins className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditing(u)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit user">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(u._id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
    </div>
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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{userName}'s progress</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6">
          {loading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock message={error} />
          ) : !courses || courses.length === 0 ? (
            <EmptyState label="courses" />
          ) : (
            <div className="space-y-6">
              {courses.map((c) => (
                <div key={c.courseId} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-medium text-slate-800 text-sm">{c.topic}</span>
                    {c.completedAt && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        Completed {fmtDate(c.completedAt)}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-50">
                    {c.lessons
                      .slice()
                      .sort((a, b) => a.lessonNumber - b.lessonNumber)
                      .map((l) => (
                        <div key={l.lessonNumber} className="px-4 py-2.5 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {l.watched ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                            )}
                            <span className="text-slate-700 truncate">
                              Lesson {l.lessonNumber}: {l.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs text-slate-400">
                            {l.watchedAt && <span>watched {fmtDate(l.watchedAt)}</span>}
                            {l.lastPositionFrame > 0 && (
                              <span className="text-slate-500 font-medium">{fmtPosition(l.lastPositionFrame, l.totalFrames)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (u: Partial<User> & { _id: string }) => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
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
      const updated = await adminApi.patch<any>(`/api/auth/${user._id}/admin`, { name, role, verified });
      onSaved(updated);
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Edit user</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as User["role"])} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="learner">learner</option>
              <option value="tutor">tutor</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            Verified
          </label>
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        <button onClick={handleSave} disabled={saving} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">Adjust credits</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {user.name} — currently <span className="font-semibold text-slate-700">{currentBalance}</span> credits
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("add")}
              className={`py-2 rounded-lg text-sm font-semibold border ${
                direction === "add" ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              + Add
            </button>
            <button
              type="button"
              onClick={() => setDirection("remove")}
              className={`py-2 rounded-lg text-sm font-semibold border ${
                direction === "remove" ? "bg-red-600 border-red-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              − Remove
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Amount</label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Reason (optional, kept in the ledger)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. goodwill credit, refund correction"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {validAmount && (
            <p className="text-xs text-slate-400">
              New balance: {direction === "add" ? currentBalance + parsedAmount : Math.max(0, currentBalance - parsedAmount)} credits
            </p>
          )}
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={saving || !validAmount}
          className={`w-full mt-4 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 text-white ${
            direction === "add" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {direction === "add" ? "Add credits" : "Remove credits"}
        </button>
      </div>
    </div>
  );
}
