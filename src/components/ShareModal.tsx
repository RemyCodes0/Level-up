// components/ShareModal.tsx
// Lets the course owner generate a public, view-only share link and copy it.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Share2, Loader2, EyeOff, Link2, MessageCircle, AlertCircle, Play, ClipboardList, ShieldCheck, RotateCcw } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const FONT = "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif";

const MODAL_CSS = `
@keyframes sm-in { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes sm-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sm-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
.sm-in { animation: sm-in .4s cubic-bezier(.2,.7,.2,1) both; }
.sm-fade { animation: sm-fade .25s ease both; }
.sm-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.sm-mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, monospace; }
@media (prefers-reduced-motion: reduce) { .sm-in, .sm-fade { animation: none; } }
`;

export function ShareModal({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const generateLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/course/${courseId}/share`, { method: "POST", headers: authHeaders() });
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

  // Escape closes (unless mid-request); lock page scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, busy]);

  const handleCopy = async () => {
    if (!shareUrl || !isShared) return;
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

  const handleNativeShare = async () => {
    if (!shareUrl) return;
    try { await navigator.share({ title: "A Level Up course", text: "Watch this course I made on Level Up:", url: shareUrl }); } catch { /* dismissed */ }
  };

  const handleUnshare = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/course/${courseId}/share`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't stop sharing. Please try again.");
      }
      setIsShared(false);
      setCopied(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Couldn't stop sharing. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const shareText = shareUrl ? `Watch this course I made on Level Up: ${shareUrl}` : "";

  return createPortal(
    <div
      className="sm-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center sm:p-4"
      style={{ fontFamily: FONT }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
    >
      <style>{MODAL_CSS}</style>
      <div className="sm-in relative w-full overflow-hidden rounded-t-3xl bg-[#12141B] text-[#ECEDF2] shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-3xl">
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[#8B7CFF]/25 blur-3xl" />
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8B7CFF] to-transparent opacity-70" />

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

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8B7CFF]/15 ring-1 ring-[#8B7CFF]/35">
            <Share2 className="h-5 w-5 text-[#B4A9FF]" />
          </div>
          <h2 id="share-title" className="sm-serif mt-5 text-[34px] leading-[1.05] text-white">Share this course</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">Anyone with the link can watch along — no account needed.</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: Play, t: "Every lesson" },
              { icon: ClipboardList, t: "The quiz" },
              { icon: ShieldCheck, t: "View-only" },
            ].map(({ icon: I, t }) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-[#B9BCCB] ring-1 ring-white/[0.08]">
                <I className="h-3 w-3 text-[#B4A9FF]" /> {t}
              </span>
            ))}
          </div>

          {loading ? (
            <div className="mt-7 space-y-2.5" aria-hidden="true">
              {[44, 48].map((h, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white/[0.04]"
                  style={{ height: h, backgroundImage: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)", backgroundSize: "250% 100%", animation: "sm-sweep 1.6s ease-in-out infinite", animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
          ) : !shareUrl && error ? (
            <div className="mt-7">
              <p className="flex items-center gap-2 rounded-xl bg-[#FF5C6C]/[0.08] px-3.5 py-2.5 text-[13px] text-[#FF8A95] ring-1 ring-[#FF5C6C]/25">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
              <button
                onClick={generateLink}
                disabled={busy}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.05] text-[13px] font-medium text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Try again
              </button>
            </div>
          ) : isShared ? (
            <div className="mt-7">
              <button
                onClick={handleCopy}
                className={`group flex w-full items-center gap-2.5 rounded-xl px-3.5 py-3 text-left ring-1 transition-colors ${copied ? "bg-[#3DDC97]/[0.08] ring-[#3DDC97]/35" : "bg-[#0A0B10]/60 ring-white/[0.1] hover:ring-white/[0.2]"}`}
                title="Copy link"
              >
                <Link2 className={`h-4 w-4 shrink-0 ${copied ? "text-[#3DDC97]" : "text-[#6E7389]"}`} />
                <span className="sm-mono min-w-0 flex-1 truncate text-xs text-[#D6D8E2]">{shareUrl}</span>
              </button>

              <button
                onClick={handleCopy}
                className={`mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
                  copied
                    ? "bg-[#3DDC97] text-[#06130D] shadow-[0_10px_30px_-10px_rgba(61,220,151,0.8)]"
                    : "bg-[#8B7CFF] text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.85)] hover:bg-[#A093FF]"
                }`}
              >
                {copied ? <><Check className="h-4 w-4" strokeWidth={3} /> Copied!</> : <><Copy className="h-4 w-4" /> Copy link</>}
              </button>

              <div className={`mt-2.5 grid gap-2.5 ${canNativeShare ? "grid-cols-2" : "grid-cols-1"}`}>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/[0.05] text-[13px] font-medium text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]"
                >
                  <MessageCircle className="h-4 w-4 text-[#3DDC97]" /> WhatsApp
                </a>
                {canNativeShare && (
                  <button
                    onClick={handleNativeShare}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/[0.05] text-[13px] font-medium text-white ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]"
                  >
                    <Share2 className="h-4 w-4" /> More options
                  </button>
                )}
              </div>

              {error && (
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#FF5C6C]/[0.08] px-3.5 py-2.5 text-[13px] text-[#FF8A95] ring-1 ring-[#FF5C6C]/25">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
                <p className="flex items-center gap-1.5 text-[12px] text-[#6E7389]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3DDC97]" /> Link is active
                </p>
                <button
                  onClick={handleUnshare}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-[#8A8FA3] ring-1 ring-white/[0.08] transition-colors hover:bg-[#FF5C6C]/[0.06] hover:text-[#FF8A95] hover:ring-[#FF5C6C]/30 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />} Stop sharing
                </button>
              </div>
            </div>
          ) : (
            // Sharing turned off — the old link no longer works, so don't offer to copy it.
            <div className="sm-in mt-7 rounded-2xl bg-white/[0.02] p-5 text-center ring-1 ring-white/[0.06]">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05]"><EyeOff className="h-4 w-4 text-[#8A8FA3]" /></span>
              <p className="mt-3 text-[15px] font-semibold text-white">Sharing is off</p>
              <p className="mt-1 text-[13px] text-[#8A8FA3]">The old link no longer works for anyone.</p>
              <button
                onClick={generateLink}
                disabled={busy}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#0A0B10] transition-colors hover:bg-[#E3E0FF] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create a new link
              </button>
              {error && <p className="mt-3 text-[12px] text-[#FF8A95]">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}