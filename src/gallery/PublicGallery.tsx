"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { PageMeta } from "@/components/PageMeta";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, X, Loader2, AlertCircle, BookOpen, User, Sparkles } from "lucide-react";
import { listPublicCourses } from "@/api/CourseApi";
import type { PublicGalleryCourse } from "@/api/CourseApi";

function toCourseTitle(topic: string): string {
  return topic
    .replace(/^(explain me|teach me|will|how does|what is)\s*/i, "")
    .replace(/^the\s+/i, "")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function PublicGallery() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [courses, setCourses] = useState<PublicGalleryCourse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  // Debounce the search box — search is a real server round-trip (a Mongo
  // text-index query), not a client-side filter, so firing one per keystroke
  // would hammer the API on every fast typist.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Any new search term starts a fresh result set — this is the one place a
  // "page" resets (a search is a different result set, not a continuation).
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    listPublicCourses(debouncedQuery, null)
      .then((res) => {
        if (id !== requestId.current) return; // a newer search superseded this one
        setCourses(res.courses);
        setCursor(res.nextCursor);
      })
      .catch(() => { if (id === requestId.current) setError(true); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [debouncedQuery]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listPublicCourses(debouncedQuery, cursor);
      setCourses((prev) => [...prev, ...res.courses]);
      setCursor(res.nextCursor);
    } catch {
      // Leave the existing page up — the "Load more" button just stays
      // clickable so the user can retry rather than losing what's loaded.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, debouncedQuery]);

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta
        title="Course Gallery — Community Courses | Level Up"
        description="Browse AI-generated courses published by the Level Up community — search by topic and watch instantly, no account needed."
        canonical="/gallery"
      />
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Community gallery
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">Courses, built by everyone</h1>
          <p className="text-slate-500 max-w-xl mx-auto">
            Every course here was published by a Level Up user. Search a topic and start watching — no account needed.
          </p>
        </div>

        <div className="relative max-w-md mx-auto mb-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search published courses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-9 bg-white"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {error ? (
          <div className="text-center py-20">
            <AlertCircle className="h-7 w-7 text-red-400 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Couldn't load the gallery. Try refreshing.</p>
          </div>
        ) : loading ? (
          <div className="text-center py-20">
            <Loader2 className="h-7 w-7 text-blue-500 animate-spin mx-auto" />
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {debouncedQuery ? `No published courses match "${debouncedQuery}".` : "No courses have been published yet — be the first!"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((c) => (
                <a key={c._id} href={c.shareUrl} className="block">
                  <Card className="h-full p-5 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer">
                    <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2">{toCourseTitle(c.topic)}</h3>
                    <div className="flex items-center justify-between text-xs text-slate-400 mt-4">
                      <span className="inline-flex items-center gap-1 truncate">
                        <User className="h-3 w-3 shrink-0" /> <span className="truncate">{c.author}</span>
                      </span>
                      <span className="shrink-0">{fmtDate(c.publishedAt)}</span>
                    </div>
                  </Card>
                </a>
              ))}
            </div>

            {cursor && (
              <div className="text-center mt-8">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
