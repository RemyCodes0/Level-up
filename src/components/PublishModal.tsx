// components/PublishModal.tsx
// Lets the course owner list a finished course in the public, searchable
// gallery (/gallery). Distinct from ShareModal: sharing is a private,
// unguessable link with no listing; publishing puts the course in a
// browsable, searchable public index. Unlike ShareModal (which auto-creates
// a link the moment it opens), this checks the CURRENT publish status first
// and only publishes when the user explicitly clicks the button — publishing
// is a more consequential, deliberate action than sharing a link.

import { useState, useEffect } from "react";
import { X, Globe2, Loader2, Check, EyeOff, ExternalLink } from "lucide-react";
import { getCourseStatus, publishCourse, unpublishCourse } from "../api/CourseApi";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Globe2 className="h-7 w-7 text-emerald-600" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
          {isPublished ? "This course is public" : "Publish to the gallery"}
        </h2>
        <p className="text-sm text-slate-500 text-center mb-6">
          {isPublished
            ? "Anyone can find and watch this course in the public gallery — no account needed."
            : "List this course in the public gallery, where anyone can search for and watch it — no account needed. You can unpublish it at any time."}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : (
          <>
            {error && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}

            {justPublished && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 border border-emerald-200 bg-emerald-50 mb-4 text-sm text-emerald-700">
                <Check className="h-4 w-4 shrink-0" /> Published! It's now visible in the gallery.
              </div>
            )}

            {!isPublished ? (
              <button
                onClick={handlePublish}
                disabled={busy}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                Publish to gallery
              </button>
            ) : (
              <div className="space-y-3">
                <a
                  href="/gallery"
                  className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all bg-slate-900 text-white hover:bg-slate-800"
                >
                  <ExternalLink className="h-4 w-4" /> View the gallery
                </a>
                <button
                  onClick={handleUnpublish}
                  disabled={busy}
                  className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                  Remove from gallery
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
