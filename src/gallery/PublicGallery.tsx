"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PageMeta } from "@/components/PageMeta";
import { Search, X, Loader2, AlertCircle, Play, ArrowRight, Sparkles, RotateCcw, Film } from "lucide-react";
import { listPublicCourses } from "@/api/CourseApi";
import type { PublicGalleryCourse } from "@/api/CourseApi";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Stable per-course hash → every course gets its own "poster" art, the same
// on every visit, with no thumbnails needed from the server.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PALETTES: [string, string][] = [
  ["#8B7CFF", "#FF7A45"],
  ["#3DDC97", "#3A7BFF"],
  ["#FF5C8A", "#FFB547"],
  ["#5CE1FF", "#8B7CFF"],
  ["#FFB547", "#FF5C6C"],
  ["#B6F36B", "#3DDC97"],
  ["#FF7AD9", "#6B5CFF"],
  ["#4DD4C6", "#B4A9FF"],
];

type PosterStyle = "rings" | "grid" | "waves" | "bars";
const STYLES: PosterStyle[] = ["rings", "grid", "waves", "bars"];

function posterFor(id: string) {
  const h = hashString(id);
  return {
    palette: PALETTES[h % PALETTES.length],
    style: STYLES[(h >>> 4) % STYLES.length],
    angle: (h >>> 8) % 360,
    seed: h,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes pg-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes pg-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes pg-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
.pg-rise { animation: pg-rise .55s cubic-bezier(.2,.7,.2,1) both; }
.pg-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.pg-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Poster art
// ─────────────────────────────────────────────────────────────────────────────

function PosterArt({ id }: { id: string }) {
  const { palette: [a, b], style, angle, seed } = posterFor(id);
  const gid = `pg-${id}`;
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-g`} gradientTransform={`rotate(${angle} .5 .5)`}>
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
        <radialGradient id={`${gid}-r`} cx="30%" cy="20%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".25" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill="#0B0C12" />
      <rect width="320" height="180" fill={`url(#${gid}-g)`} opacity=".85" />
      <g stroke="#0B0C12" strokeOpacity=".35" fill="none">
        {style === "rings" &&
          Array.from({ length: 9 }).map((_, i) => (
            <circle key={i} cx={240 - (seed % 60)} cy={50 + (seed % 70)} r={18 + i * 22} strokeWidth="1.5" />
          ))}
        {style === "grid" &&
          Array.from({ length: 12 }).map((_, i) => (
            <g key={i}>
              <line x1={i * 28} y1="0" x2={i * 28} y2="180" strokeWidth="1" />
              <line x1="0" y1={i * 28} x2="320" y2={i * 28} strokeWidth="1" />
            </g>
          ))}
        {style === "waves" &&
          Array.from({ length: 10 }).map((_, i) => (
            <path key={i} d={`M0 ${20 + i * 18} Q 80 ${(i * 18 + (seed % 40))} 160 ${20 + i * 18} T 320 ${20 + i * 18}`} strokeWidth="1.5" />
          ))}
      </g>
      {style === "bars" &&
        Array.from({ length: 22 }).map((_, i) => {
          const h = 20 + ((seed >>> (i % 24)) % 110);
          return <rect key={i} x={12 + i * 14} y={180 - h} width="6" height={h} rx="3" fill="#0B0C12" opacity=".28" />;
        })}
      <rect width="320" height="180" fill={`url(#${gid}-r)`} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────────────────────

function CourseCard({ course, index, featured = false }: { course: PublicGalleryCourse; index: number; featured?: boolean }) {
  const title = toCourseTitle(course.topic);
  return (
    <Link
      to={course.shareUrl}
      className={cx(
        "pg-rise group relative flex flex-col overflow-hidden rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07] transition-all duration-300 hover:-translate-y-1 hover:ring-white/[0.18] hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]",
        featured && "sm:col-span-2 sm:row-span-2"
      )}
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <div className={cx("relative overflow-hidden", featured ? "aspect-[16/9] sm:aspect-auto sm:flex-1 sm:min-h-[300px]" : "aspect-[16/9]")}>
        <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.06]">
          <PosterArt id={course._id} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#11131A] via-[#11131A]/20 to-transparent" />
        {featured && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white ring-1 ring-white/15 backdrop-blur-md">
            <Sparkles className="h-3 w-3" /> Latest
          </span>
        )}
        <span className="absolute right-4 top-4 flex h-10 w-10 scale-90 items-center justify-center rounded-full bg-white text-[#0A0B10] opacity-0 shadow-xl transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
        {featured && (
          <h3 className="pg-serif absolute inset-x-5 bottom-4 line-clamp-3 text-[32px] leading-[1.05] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] sm:inset-x-7 sm:bottom-6 sm:text-[48px]">
            {title}
          </h3>
        )}
      </div>

      <div className={cx("flex flex-1 flex-col", featured ? "px-5 pb-5 pt-3 sm:px-7 sm:pb-6" : "p-5 pt-3")}>
        {!featured && <h3 className="pg-serif mb-4 line-clamp-2 text-[24px] leading-[1.1] text-white">{title}</h3>}
        <div className="mt-auto flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[9px] font-bold text-[#D6D8E2] ring-1 ring-white/10">
              {initials(course.author)}
            </span>
            <span className="truncate text-[#B9BCCB]">{course.author}</span>
          </span>
          <span className="shrink-0 text-[#6E7389]">{fmtDate(course.publishedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function CardSkeleton({ i }: { i: number }) {
  const sweep = {
    backgroundImage: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)",
    backgroundSize: "250% 100%",
    animation: "pg-sweep 1.7s ease-in-out infinite",
    animationDelay: `${i * 0.12}s`,
  };
  return (
    <div className="overflow-hidden rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]" aria-hidden="true">
      <div className="aspect-[16/9] bg-white/[0.04]" style={sweep} />
      <div className="space-y-3 p-5">
        <div className="h-5 w-4/5 rounded-md bg-white/[0.05]" style={sweep} />
        <div className="h-5 w-1/2 rounded-md bg-white/[0.05]" style={sweep} />
        <div className="flex justify-between pt-2">
          <div className="h-3 w-24 rounded bg-white/[0.04]" />
          <div className="h-3 w-16 rounded bg-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof Film; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="pg-rise mx-auto flex max-w-sm flex-col items-center py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08]">
        <Icon className="h-6 w-6 text-[#8A8FA3]" />
      </div>
      <p className="pg-serif text-3xl text-white">{title}</p>
      <p className="mt-2 text-sm text-[#8A8FA3]">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function PublicGallery() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [courses, setCourses] = useState<PublicGalleryCourse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced — search is a server round-trip (Mongo text index), not a client filter.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // A new search term starts a fresh result set; stale responses are dropped.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    listPublicCourses(debouncedQuery, null)
      .then((res) => {
        if (id !== requestId.current) return;
        setCourses(res.courses);
        setCursor(res.nextCursor);
      })
      .catch(() => { if (id === requestId.current) setError(true); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [debouncedQuery, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listPublicCourses(debouncedQuery, cursor);
      setCourses((prev) => [...prev, ...res.courses]);
      setCursor(res.nextCursor);
    } catch {
      // Keep what's loaded; the button stays clickable for a retry.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, debouncedQuery]);

  // "/" focuses search, Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape" && t === searchRef.current) { setQuery(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searching = query.trim() !== debouncedQuery || (loading && !!debouncedQuery);
  const showFeatured = !debouncedQuery && courses.length >= 4;

  return (
    <div
      className="min-h-screen bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <PageMeta
        title="Course Gallery — Community Courses | Level Up"
        description="Browse AI-generated courses published by the Level Up community — search by topic and watch instantly, no account needed."
        canonical="/gallery"
      />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>

      <div className="relative overflow-hidden">
        {/* Hero backdrop */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-48 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-30 blur-[110px]"
            style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "pg-aurora 18s ease-in-out infinite" }}
          />
          <div
            className="absolute -right-40 top-20 h-[360px] w-[460px] rounded-full opacity-15 blur-[110px]"
            style={{ background: "radial-gradient(closest-side, #FF7A45, transparent)", animation: "pg-aurora 22s ease-in-out infinite reverse" }}
          />
          <div className="pg-grain absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A0B10]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6 sm:pt-20">
          <header className="pg-rise mx-auto mb-10 max-w-2xl text-center sm:mb-12">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#B9BCCB] ring-1 ring-white/[0.08]">
              <Film className="h-3.5 w-3.5 text-[#B4A9FF]" /> Community gallery
            </span>
            <h1 className="pg-serif mt-6 text-[44px] leading-[1.02] text-white sm:text-[72px]">
              Courses, built by{" "}
              <span className="italic bg-gradient-to-r from-[#C3BAFF] via-[#8B7CFF] to-[#FF7A45] bg-clip-text text-transparent">everyone</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-[#8A8FA3]">
              Every course here was published by a Level Up learner. Search a topic and press play — no account needed.
            </p>
          </header>

          {/* Search */}
          <div className="pg-rise mx-auto mb-12 max-w-xl" style={{ animationDelay: "80ms" }}>
            <div className="rounded-2xl bg-gradient-to-b from-white/[0.16] to-white/[0.03] p-px transition-colors focus-within:from-[#8B7CFF]/70 focus-within:to-[#FF7A45]/25">
              <div className="relative flex h-14 items-center rounded-[15px] bg-[#101218]/95 backdrop-blur-xl">
                <Search className="pointer-events-none absolute left-4 h-4 w-4 text-[#6E7389]" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search published courses"
                  aria-label="Search published courses"
                  className="h-full w-full bg-transparent pl-11 pr-24 text-[15px] text-white placeholder:text-[#555A6E] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                <div className="absolute right-3 flex items-center gap-2">
                  {searching && <Loader2 className="h-4 w-4 animate-spin text-[#8B7CFF]" />}
                  {query ? (
                    <button
                      onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8A8FA3] transition-colors hover:bg-white/[0.08] hover:text-white"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <kbd className="hidden h-6 items-center rounded-md bg-white/[0.05] px-2 font-mono text-[11px] text-[#6E7389] ring-1 ring-white/[0.08] sm:inline-flex">/</kbd>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results header */}
          {!error && !loading && courses.length > 0 && (
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">
                {debouncedQuery ? <>Results for <span className="normal-case tracking-normal text-white">“{debouncedQuery}”</span></> : "Recently published"}
              </p>
            </div>
          )}

          {error ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load the gallery"
              body="Something went wrong on our side. Give it another try."
              action={
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/[0.06] px-4 text-sm font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-white/[0.1]"
                >
                  <RotateCcw className="h-4 w-4" /> Retry
                </button>
              }
            />
          ) : loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} i={i} />)}
            </div>
          ) : courses.length === 0 ? (
            debouncedQuery ? (
              <EmptyState
                icon={Search}
                title="Nothing here yet"
                body={`No published courses match “${debouncedQuery}”. Why not make it yourself?`}
                action={
                  <Link to="/ai_tutor" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#8B7CFF] px-5 text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] transition-colors hover:bg-[#A093FF]">
                    <Sparkles className="h-4 w-4" /> Generate this course
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={Film}
                title="The stage is empty"
                body="No courses have been published yet — be the first."
                action={
                  <Link to="/ai_tutor" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#8B7CFF] px-5 text-sm font-semibold text-[#0A0B10] transition-colors hover:bg-[#A093FF]">
                    Create a course <ArrowRight className="h-4 w-4" />
                  </Link>
                }
              />
            )
          ) : (
            <>
              <div className="grid auto-rows-auto gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((c, i) => (
                  <CourseCard key={c._id} course={c} index={i} featured={showFeatured && i === 0} />
                ))}
              </div>

              {cursor && (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/[0.05] px-6 text-sm font-medium text-white ring-1 ring-white/[0.1] transition-all hover:bg-white/[0.09] hover:ring-white/[0.2] disabled:opacity-60"
                  >
                    {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</> : <>Load more courses <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
              )}

              <div className="mt-20 overflow-hidden rounded-3xl bg-gradient-to-br from-[#8B7CFF]/[0.14] via-[#11131A] to-[#FF7A45]/[0.08] p-8 text-center ring-1 ring-white/[0.08] sm:p-12">
                <p className="pg-serif text-3xl text-white sm:text-5xl">Don't see your topic?</p>
                <p className="mx-auto mt-3 max-w-md text-sm text-[#8A8FA3]">Type any subject or upload your lecture notes — Level Up animates a full course in about 5 minutes.</p>
                <Link to="/ai_tutor" className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-[#8B7CFF] px-6 text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] transition-colors hover:bg-[#A093FF]">
                  <Sparkles className="h-4 w-4" /> Create your own course
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}