"use client";

import { useEffect, useState } from "react";
import { Trash2, Star } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState, Pagination, fmtDate } from "../components";

interface Feedback {
  _id: string;
  userName: string;
  userEmail: string | null;
  courseName: string | null;
  rating: number;
  message: string;
  createdAt: string;
}

interface Review {
  _id: string;
  tutor: { name: string; email: string } | null;
  student: { name: string; email: string } | null;
  rating: number;
  comment: string;
  createdAt: string;
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < n ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
      ))}
    </div>
  );
}

export default function FeedbackAndReviews() {
  const [tab, setTab] = useState<"feedback" | "reviews">("feedback");
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Feedback & Reviews"
        right={
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={() => setTab("feedback")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "feedback" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>App feedback</button>
            <button onClick={() => setTab("reviews")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "reviews" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Tutor reviews</button>
          </div>
        }
      />
      {tab === "feedback" ? <FeedbackTab /> : <ReviewsTab />}
    </div>
  );
}

function FeedbackTab() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi
      .get<{ feedback: Feedback[]; pagination: { pages: number } }>(`/api/feedback/admin?page=${page}&limit=20`)
      .then((res) => { setItems(res.feedback); setPages(res.pagination.pages); })
      .catch((err) => setError(err.message || "Failed to load feedback."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [page]);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this feedback entry?")) return;
    try {
      await adminApi.delete(`/api/feedback/admin/${id}`);
      setItems((prev) => prev.filter((f) => f._id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete.");
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {items.length === 0 ? (
        <div className="p-8"><EmptyState label="feedback" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((f) => (
            <div key={f._id} className="px-5 py-4 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Stars n={f.rating} />
                  <span className="text-xs text-slate-400">{f.userName}{f.userEmail ? ` · ${f.userEmail}` : ""}</span>
                </div>
                {f.courseName && <p className="text-xs text-indigo-600 mb-1">{f.courseName}</p>}
                <p className="text-sm text-slate-700">{f.message}</p>
                <p className="text-xs text-slate-400 mt-1">{fmtDate(f.createdAt)}</p>
              </div>
              <button onClick={() => remove(f._id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onChange={setPage} />
    </div>
  );
}

function ReviewsTab() {
  const [items, setItems] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi
      .get<{ reviews: Review[]; pagination: { pages: number } }>(`/api/reviews/admin?page=${page}&limit=20`)
      .then((res) => { setItems(res.reviews); setPages(res.pagination.pages); })
      .catch((err) => setError(err.message || "Failed to load reviews."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [page]);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this review?")) return;
    try {
      await adminApi.delete(`/api/reviews/admin/${id}`);
      setItems((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete.");
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {items.length === 0 ? (
        <div className="p-8"><EmptyState label="reviews" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((r) => (
            <div key={r._id} className="px-5 py-4 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Stars n={r.rating} />
                  <span className="text-xs text-slate-400">
                    {r.student?.name || "Unknown"} → {r.tutor?.name || "Unknown tutor"}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{r.comment}</p>
                <p className="text-xs text-slate-400 mt-1">{fmtDate(r.createdAt)}</p>
              </div>
              <button onClick={() => remove(r._id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} onChange={setPage} />
    </div>
  );
}
