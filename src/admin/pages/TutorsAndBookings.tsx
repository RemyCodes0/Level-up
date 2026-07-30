"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Trash2, Mail, DollarSign, Ban } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState, StatusBadge, fmtDate } from "../components";

interface Application {
  _id: string;
  user: { name: string; email: string };
  bio: string;
  subjects: { code: string; name: string }[];
  hourlyRate: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface Booking {
  _id: string;
  tutor: { bio: string; user: { name: string; email: string } } | null;
  student: { name: string; email: string };
  subject: string;
  slot: { day: string; from: string; to: string };
  duration: number;
  status: string;
  totalAmount: number;
  createdAt: string;
}

export default function TutorsAndBookings() {
  const [tab, setTab] = useState<"applications" | "bookings">("applications");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Tutors & Bookings"
        right={
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={() => setTab("applications")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "applications" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Applications</button>
            <button onClick={() => setTab("bookings")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "bookings" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Bookings</button>
          </div>
        }
      />
      {tab === "applications" ? <ApplicationsTab /> : <BookingsTab />}
    </div>
  );
}

function ApplicationsTab() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi
      .get<Application[]>("/api/tutor/applications")
      .then(setApps)
      .catch((err) => setError(err.message || "Failed to load applications."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi.patch(`/api/tutor/${id}/approve`);
      setApps((prev) => prev.map((a) => (a._id === id ? { ...a, status: "approved" } : a)));
    } catch (err: any) {
      alert(err.message || "Failed to approve.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi.patch(`/api/tutor/${id}/reject`);
      setApps((prev) => prev.map((a) => (a._id === id ? { ...a, status: "rejected" } : a)));
    } catch (err: any) {
      alert(err.message || "Failed to reject.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this application permanently?")) return;
    setBusyId(id);
    try {
      await adminApi.delete(`/api/tutor/${id}/delete`);
      setApps((prev) => prev.filter((a) => a._id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {apps.length === 0 ? (
        <div className="p-8"><EmptyState label="applications" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {apps.map((app) => (
            <div key={app._id} className="px-5 py-4 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-800">{app.user?.name}</p>
                  <StatusBadge status={app.status} />
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1 mb-2"><Mail className="h-3 w-3" />{app.user?.email}</p>
                <p className="text-xs text-slate-600 mb-2">{app.bio}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(app.subjects || []).map((s) => (
                    <span key={s.code} className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">{s.code} · {s.name}</span>
                  ))}
                </div>
                <p className="text-xs text-slate-400">${app.hourlyRate}/hr · applied {fmtDate(app.createdAt)}</p>
              </div>
              {app.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => approve(app._id)} disabled={busyId === app._id} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => reject(app._id)} disabled={busyId === app._id} className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}
              <button onClick={() => remove(app._id)} disabled={busyId === app._id} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingsTab() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi
      .get<Booking[]>("/api/book/allBookings")
      .then(setBookings)
      .catch((err) => setError(err.message || "Failed to load bookings."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const cancel = async (id: string) => {
    if (!window.confirm("Cancel this booking?")) return;
    setBusyId(id);
    try {
      await adminApi.put(`/api/book/admin/cancel/${id}`);
      setBookings((prev) => prev.map((b) => (b._id === id ? { ...b, status: "canceled" } : b)));
    } catch (err: any) {
      alert(err.message || "Failed to cancel.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {bookings.length === 0 ? (
        <div className="p-8"><EmptyState label="bookings" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {bookings.map((b) => (
            <div key={b._id} className="px-5 py-3 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-slate-800">{b.subject}</p>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {b.tutor?.user?.name || "Unknown tutor"} → {b.student?.name} · {b.slot?.day} {b.slot?.from}-{b.slot?.to}
                </p>
              </div>
              <span className="text-sm font-semibold text-emerald-600 flex items-center gap-0.5 shrink-0"><DollarSign className="h-3.5 w-3.5" />{b.totalAmount?.toFixed(2)}</span>
              {b.status !== "canceled" && (
                <button onClick={() => cancel(b._id)} disabled={busyId === b._id} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0 disabled:opacity-50">
                  <Ban className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
