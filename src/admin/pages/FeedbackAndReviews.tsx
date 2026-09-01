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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader title="Feedback" />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
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
      )}
    </div>
  );
}
