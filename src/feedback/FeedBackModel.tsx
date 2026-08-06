import { useEffect, useState } from "react";
import { X, Star, Loader2, CheckCircle, MessageSquare, Coins, Gift } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface FeedbackModalProps {
  onClose: () => void;
  courseId?: string | null;
  courseName?: string | null;
  // Called once the backend confirms the submission — creditsAwarded is 0
  // when no reward was granted (already claimed before, or not logged in).
  // Lets the parent (e.g. AiTutor's sidebar credit counter) refresh its own
  // balance without this modal needing to know how that's stored.
  onSuccess?: (creditsAwarded: number) => void;
}

export function FeedbackModal({ onClose, courseId, courseName, onSuccess }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"form" | "submitting" | "success" | "error">("form");
  const [errorMsg, setErrorMsg] = useState("");
  const [creditsAwarded, setCreditsAwarded] = useState(0);
  // Whether this logged-in user has already claimed the one-time feedback
  // credit bonus — drives the pre-submit banner below. Stays false (banner
  // hidden) for logged-out visitors, since the reward only applies once a
  // real account can hold the credits.
  const [alreadyClaimed, setAlreadyClaimed] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${BASE_URL}/api/payment/credits`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setAlreadyClaimed(!!data.feedbackCreditGranted); })
      .catch(() => {}); // banner just stays hidden if this fails — not worth surfacing an error for
  }, []);

  const handleSubmit = async () => {
    if (rating === 0 || !message.trim()) return;
    setStatus("submitting");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rating,
          message: message.trim(),
          courseId: courseId || null,
          courseName: courseName || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const awarded = data.creditsAwarded || 0;
        setCreditsAwarded(awarded);
        if (awarded > 0) setAlreadyClaimed(true);
        setStatus("success");
        onSuccess?.(awarded);
      } else {
        setErrorMsg(data.message || "Failed to submit");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Couldn't reach the server. Please try again.");
      setStatus("error");
    }
  };

  const ratingLabels = ["", "Poor", "Fair", "Good", "Great", "Amazing"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* ── Success state ── */}
        {status === "success" ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Thanks for your feedback!</h3>
            <p className="text-sm text-slate-500 mb-5">Your input helps us improve Level Up.</p>
            {creditsAwarded > 0 && (
              <div className="flex items-center justify-center gap-2 mb-5 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
                <Coins className="h-4 w-4" />
                <span className="text-sm font-semibold">+{creditsAwarded} credits added to your account!</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Share your feedback</h3>
                {courseName && <p className="text-xs text-slate-400">{courseName}</p>}
              </div>
            </div>

            {/* One-time reward notice — only shown pre-submission, and only to
                logged-in users who haven't already claimed it. */}
            {!alreadyClaimed && (
              <div className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
                <Gift className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-semibold">
                  Get 20 credits for your first feedback submission!
                </span>
              </div>
            )}

            {/* Star rating */}
            <div className="mb-5">
              <p className="text-sm font-medium text-slate-700 mb-2">How would you rate your experience?</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        star <= (hoveredStar || rating)
                          ? "fill-amber-400 text-amber-400"
                          : "fill-none text-slate-300"
                      }`}
                    />
                  </button>
                ))}
                {(hoveredStar || rating) > 0 && (
                  <span className="ml-2 text-sm text-slate-500 font-medium">
                    {ratingLabels[hoveredStar || rating]}
                  </span>
                )}
              </div>
            </div>

            {/* Message */}
            <div className="mb-5">
              <p className="text-sm font-medium text-slate-700 mb-2">Tell us more</p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What did you like? What could be better?"
                maxLength={2000}
                rows={4}
                className="w-full resize-none rounded-xl border-2 border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
              />
              <p className="text-xs text-slate-400 text-right mt-1">{message.length}/2000</p>
            </div>

            {/* Error */}
            {status === "error" && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {errorMsg}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={rating === 0 || !message.trim() || status === "submitting"}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {status === "submitting" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
              ) : (
                "Submit feedback"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Floating feedback button ────────────────────────────────────────────────
export function FeedbackFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
      title="Send feedback"
    >
      <MessageSquare className="h-5 w-5" />
      <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        Send feedback
      </span>
    </button>
  );
}