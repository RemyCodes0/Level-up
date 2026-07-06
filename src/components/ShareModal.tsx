// components/ShareModal.tsx
// Lets the course owner generate a public, view-only share link and copy it.

import { useState, useEffect } from "react";
import { X, Copy, Check, Share2, Loader2, EyeOff } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export function ShareModal({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const generateLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/course/${courseId}/share`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate share link");
      setShareUrl(data.shareUrl);
      setIsShared(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    generateLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUnshare = async () => {
    setBusy(true);
    try {
      await fetch(`${BASE_URL}/api/course/${courseId}/share`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setIsShared(false);
    } catch (err) {
      console.error(err);
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

        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Share2 className="h-7 w-7 text-blue-600" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Share this course</h2>
        <p className="text-sm text-slate-500 text-center mb-6">
          Anyone with this link can watch every lesson and take the quiz — no account needed. They can't edit or delete it.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 text-center mb-4">{error}</p>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 border border-slate-200 bg-slate-50 mb-4">
              <span className="text-xs flex-1 truncate font-mono text-slate-500">{shareUrl}</span>
            </div>

            <button
              onClick={handleCopy}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all mb-3"
              style={{ backgroundColor: copied ? "#dcfce7" : "#2563eb", color: copied ? "#16a34a" : "#fff" }}
            >
              {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy link</>}
            </button>

            {isShared && (
              <button
                onClick={handleUnshare}
                disabled={busy}
                className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                Stop sharing
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}