// components/PublishModal.tsx
// Lets the course owner list a finished course in the public, searchable
// gallery (/gallery). Distinct from ShareModal: sharing is a private,
// unguessable link with no listing; publishing puts the course in a
// browsable, searchable public index. Unlike ShareModal (which auto-creates
// a link the moment it opens), this checks the CURRENT publish status first
// and only publishes when the user explicitly clicks the button — publishing
// is a more consequential, deliberate action than sharing a link.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X, Globe2, Loader2, Check, EyeOff, ArrowUpRight, AlertCircle, Search, User, Film, Lock } from "lucide-react";
import { getCourseStatus, publishCourse, unpublishCourse } from "../api/CourseApi";

const FONT = "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif";

const MODAL_CSS = `
@keyframes pm-in { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes pm-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pm-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); } }
@keyframes pm-ring { 0% { transform: scale(.9); opacity: .7; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes pm-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.pm-in { animation: pm-in .4s cubic-bezier(.2,.7,.2,1) both; }
.pm-fade { animation: pm-fade .25s ease both; }
.pm-pop { animation: pm-pop .55s cubic-bezier(.2,.7,.2,1) both; }
.pm-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
@media (prefers-reduced-motion: reduce) { .pm-in, .pm-fade, .pm-pop { animation: none; } }
`;

export function PublishModal({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCourseStatus(courseId)
      .then((course) => { if (!cancelled) setIsPublished(!!course.isPublished); })
      .catch(() => { if (!cancelled) setError("Couldn't check this course's publish status."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  // Escape closes (unless a publish/unpublish is mid-flight); lock page scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, busy]);

  const handlePublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await publishCourse(courseId);
      setIsPublished(true);
      setJustPublished(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleUnpublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await unpublishCourse(courseId);
      setIsPublished(false);
      setJustPublished(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const accent = isPublished ? "#3DDC97" : "#8B7CFF";

  return createPortal(
    <div
      className="pm-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center sm:p-4"
      style={{ fontFamily: FONT }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-title"
    >
      <style>{MODAL_CSS}</style>
      <div className="pm-in relative w-full overflow-hidden rounded-t-3xl bg-[#12141B] text-[#ECEDF2] shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-3xl">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl transition-colors duration-700" style={{ background: accent }} />
        <span className="absolute inset-x-0 top-0 h-px opacity-70 transition-colors duration-700" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

        <button
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:p-8">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

          {/* Status emblem */}
          <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
            {isPublished && <span className="absolute inset-0 rounded-2xl" style={{ background: `${accent}40`, animation: "pm-ring 1.8s ease-out infinite" }} />}
            <span
              key={String(isPublished)}
              className="pm-pop relative flex h-16 w-16 items-center justify-center rounded-2xl ring-1 transition-colors duration-500"
              style={{ background: `${accent}1F`, boxShadow: `inset 0 0 0 1px ${accent}66` }}
            >
              <Globe2 className="h-7 w-7" style={{ color: accent, animation: isPublished ? "pm-orbit 18s linear infinite" : undefined }} />
            </span>
          </div>

          <div className="text-center">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1"
              style={isPublished
                ? { color: "#7BE8B8", background: "rgba(61,220,151,0.1)", borderColor: "transparent", boxShadow: "inset 0 0 0 1px rgba(61,220,151,0.3)" }
                : { color: "#B9BCCB", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : isPublished ? <span className="h-1.5 w-1.5 rounded-full bg-[#3DDC97]" /> : <Lock className="h-3 w-3" />}
              {loading ? "Checking status" : isPublished ? "Public" : "Private"}
            </span>
            <h2 id="publish-title" className="pm-serif mt-3 text-[34px] leading-[1.05] text-white">
              {isPublished ? "This course is public" : "Publish to the gallery"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#8A8FA3]">
              {isPublished
                ? "Anyone can find and watch this course in the public gallery — no account needed."
                : "List this course in the public gallery, where anyone can search for it and watch — no account needed. You can unpublish it any time."}
            </p>
          </div>

          {loading ? (
            <div className="mt-7 space-y-2.5" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-white/[0.04]" style={{ animationDelay: `${i * 0.12}s` }} />)}
            </div>
          ) : (
            <>
              {!isPublished && (
                <ul className="mt-7 space-y-2 rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06]">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">What people will see</p>
                  {[
                    { icon: Film, t: "Every lesson and the quiz" },
                    { icon: User, t: "Your name as the author" },
                    { icon: Search, t: "Searchable by topic" },
                  ].map(({ icon: I, t }) => (
                    <li key={t} className="flex items-center gap-2.5 text-[13px] text-[#D6D8E2]">
                      <I className="h-3.5 w-3.5 shrink-0 text-[#B4A9FF]" /> {t}
                    </li>
                  ))}
                </ul>
              )}

              {error && (
                <p className="mt-5 flex items-center gap-2 rounded-xl bg-[#FF5C6C]/[0.08] px-3.5 py-2.5 text-[13px] text-[#FF8A95] ring-1 ring-[#FF5C6C]/25">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              {justPublished && (
                <p className="pm-in mt-5 flex items-center gap-2 rounded-xl bg-[#3DDC97]/[0.08] px-3.5 py-2.5 text-[13px] text-[#7BE8B8] ring-1 ring-[#3DDC97]/25">
                  <Check className="h-4 w-4 shrink-0" strokeWidth={3} /> Published — it's now live in the gallery.
                </p>
              )}

              {!isPublished ? (
                <button
                  onClick={handlePublish}
                  disabled={busy}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.85)] transition-all hover:bg-[#A093FF] disabled:opacity-60"
                >
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</> : <><Globe2 className="h-4 w-4" /> Publish to gallery</>}
                </button>
              ) : (
                <div className="mt-6 space-y-2.5">
                  <Link
                    to="/gallery"
                    onClick={onClose}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[#0A0B10] transition-colors hover:bg-[#E3E0FF]"
                  >
                    View in the gallery <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={handleUnpublish}
                    disabled={busy}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-medium text-[#8A8FA3] ring-1 ring-white/[0.08] transition-colors hover:bg-[#FF5C6C]/[0.06] hover:text-[#FF8A95] hover:ring-[#FF5C6C]/30 disabled:opacity-50"
                  >
                    {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Removing…</> : <><EyeOff className="h-3.5 w-3.5" /> Remove from gallery</>}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}