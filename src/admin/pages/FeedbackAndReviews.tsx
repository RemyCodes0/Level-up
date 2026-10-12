"use client";

import { useEffect, useState } from "react";
import { Trash2, Star, MessageSquare } from "lucide-react";
import { adminApi } from "../adminApi";
import {
  Page, PageHeader, Card, RowList, LoadingBlock, ErrorBlock, EmptyState, Pagination, fmtDate,
} from "../components";
import { EYEBROW, cx } from "../theme";

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
    <div className="flex gap-0.5" title={`${n} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cx("h-3.5 w-3.5", i < n ? "fill-[#FFB547] text-[#FFB547]" : "text-white/[0.12]")} />
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

  // Average over the page in view — the endpoint paginates and returns no
  // aggregate, so this is deliberately labelled "this page", not "all time".
  const avg = items.length > 0 ? items.reduce((s, f) => s + f.rating, 0) / items.length : null;

  return (
    <Page max="5xl">
      <PageHeader
        title="Feedback"
        sub="What learners said after finishing a course, newest first."
        right={
          avg !== null && (
            <div className="rounded-xl bg-[#11131A] px-4 py-2.5 ring-1 ring-white/[0.07]">
              <span className={cx(EYEBROW, "text-[10px]")}>Avg · this page</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-semibold leading-none text-white tabular-nums">{avg.toFixed(1)}</span>
                <Stars n={Math.round(avg)} />
              </div>
            </div>
          )
        }
      />

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <Card pad={false}>
          {items.length === 0 ? (
            <div className="p-5"><EmptyState label="feedback" /></div>
          ) : (
            <RowList>
              {items.map((f) => (
                <div key={f._id} className="group flex items-start gap-4 px-5 py-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/[0.07]">
                    <MessageSquare className="h-3.5 w-3.5 text-[#6E7389]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Stars n={f.rating} />
                      <span className="text-[11px] text-[#8A8FA3]">
                        {f.userName}
                        {f.userEmail ? <span className="text-[#5B607A]"> · {f.userEmail}</span> : ""}
                      </span>
                      <span className="text-[11px] text-[#4A4F63]">{fmtDate(f.createdAt)}</span>
                    </div>
                    {f.courseName && (
                      <p className="mb-1 text-[11px] font-medium text-[#B4A9FF]">{f.courseName}</p>
                    )}
                    <p className="text-[13px] leading-relaxed text-[#D6D8E2]">{f.message}</p>
                  </div>
                  <button
                    onClick={() => remove(f._id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#4A4F63] opacity-0 transition-colors hover:bg-[#FF5C6C]/10 hover:text-[#FF8A95] focus-visible:opacity-100 group-hover:opacity-100"
                    title="Delete this feedback"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </RowList>
          )}
          <Pagination page={page} pages={pages} onChange={setPage} />
        </Card>
      )}
    </Page>
  );
}
