// components/ReferralCard.tsx
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { analytics } from "../lib/analytics";
import { Copy, Check, Users, Gift, X, ChevronRight, MessageCircle, Share2 } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface ReferralData {
  code: string;
  link: string;
  totalReferrals: number;
  creditsEarned: number;
  creditsPerReferral: number;
}

const FONT = "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif";

const MODAL_CSS = `
@keyframes rc-in { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes rc-fade { from { opacity: 0; } to { opacity: 1; } }
.rc-in { animation: rc-in .4s cubic-bezier(.2,.7,.2,1) both; }
.rc-fade { animation: rc-fade .25s ease both; }
.rc-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
`;

function ReferralModal({ link, creditsPerReferral, onClose }: { link: string; creditsPerReferral: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareText = `I've been learning with Level Up — it turns any topic into an animated video course. Sign up with my link: ${link}`;

  // Escape closes; lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(link); }
    catch {
      const input = document.createElement("input");
      input.value = link; document.body.appendChild(input);
      input.select(); document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    analytics.referralLinkCopied();
    setTimeout(() => setCopied(false), 2500);
  };

  const handleNativeShare = async () => {
    try { await navigator.share({ title: "Join me on Level Up", text: shareText, url: link }); } catch { /* dismissed */ }
  };

  const steps = [
    { title: "Share your link", description: "Send it to a friend over WhatsApp, text, or email." },
    { title: "They sign up", description: "They create a free Level Up account using your link." },
    { title: "They verify their email", description: "One click on the confirmation link in their inbox — the same step everyone does." },
    { title: `You earn ${creditsPerReferral} credits`, description: "Credited the moment they verify. No limit, no waiting." },
  ];

  // Portaled to <body>: the sidebar drawer is CSS-transformed on mobile,
  // which would otherwise trap a position:fixed modal inside the drawer.
  return createPortal(
    <div
      className="rc-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center sm:p-4"
      style={{ fontFamily: FONT }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="referral-title"
    >
      <style>{MODAL_CSS}</style>
      {/* Bottom sheet on mobile, centered card on desktop. Header + footer
          pinned; only the middle scrolls (dvh accounts for mobile browser chrome). */}
      <div className="rc-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#12141B] text-[#ECEDF2] shadow-2xl ring-1 ring-white/10 sm:max-h-[90vh] sm:max-w-md sm:rounded-3xl">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#FFB547]/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -top-10 h-56 w-56 rounded-full bg-[#8B7CFF]/20 blur-3xl" />

        {/* Header */}
        <div className="relative shrink-0 px-6 pb-5 pt-5 sm:pt-7">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
          <button onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFB547]/10 ring-1 ring-[#FFB547]/30">
            <Gift className="h-5 w-5 text-[#FFB547]" />
          </div>
          <h2 id="referral-title" className="rc-serif mt-4 pr-8 text-[32px] leading-[1.05] text-white">Invite friends, earn credits</h2>
          <p className="mt-2 text-sm text-[#8A8FA3]">
            Every friend who signs up and verifies = <span className="font-semibold text-[#FFB547]">+{creditsPerReferral} credits</span> for you. No limit.
          </p>
        </div>

        {/* Scrollable middle */}
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
          <ol className="relative space-y-4 pb-5">
            <span className="absolute bottom-4 left-[15px] top-4 w-px bg-white/[0.08]" aria-hidden="true" />
            {steps.map((step, i) => {
              const last = i === steps.length - 1;
              return (
                <li key={i} className="relative flex items-start gap-3.5">
                  <span
                    className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold ring-1"
                    style={last
                      ? { background: "#3DDC97", color: "#06130D", boxShadow: "0 0 20px -4px rgba(61,220,151,0.8)" }
                      : { background: "#12141B", color: "#B9BCCB", borderColor: "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
                  >
                    {last ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className={`text-sm font-semibold ${last ? "text-[#7BE8B8]" : "text-white"}`}>{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#8A8FA3]">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mb-5 rounded-xl bg-[#FFB547]/[0.07] p-3.5 ring-1 ring-[#FFB547]/20">
            <p className="text-xs leading-relaxed text-[#E8C890]">
              <span className="font-semibold text-[#FFB547]">Heads up:</span> credits only land once your friend clicks the confirmation link we email them. Signing up without verifying won't trigger it.
            </p>
          </div>
        </div>

        {/* Pinned footer: link + actions */}
        <div className="relative shrink-0 space-y-2.5 border-t border-white/[0.06] px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          <button
            onClick={handleCopy}
            className="flex w-full items-center gap-2 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-left ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.06]"
            title="Copy link"
          >
            <span className="flex-1 truncate font-mono text-xs text-[#B9BCCB]">{link}</span>
            {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-[#3DDC97]" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-[#6E7389]" />}
          </button>
          <button
            onClick={handleCopy}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
              copied
                ? "bg-[#3DDC97] text-[#06130D] shadow-[0_10px_30px_-10px_rgba(61,220,151,0.8)]"
                : "bg-[#8B7CFF] text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] hover:bg-[#A093FF]"
            }`}
          >
            {copied ? <><Check className="h-4 w-4" /> Copied — now send it to a friend</> : <><Copy className="h-4 w-4" /> Copy my invite link</>}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] text-xs font-medium text-[#D6D8E2] ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.08] hover:text-white ${canNativeShare ? "" : "col-span-2"}`}
            >
              <MessageCircle className="h-3.5 w-3.5 text-[#3DDC97]" /> WhatsApp
            </a>
            {canNativeShare && (
              <button
                onClick={handleNativeShare}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] text-xs font-medium text-[#D6D8E2] ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" /> More options
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ReferralCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    fetch(`${BASE_URL}/api/referral/link`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return null;

  const hasReferrals = data.totalReferrals > 0;

  return (
    <>
      {showModal && <ReferralModal link={data.link} creditsPerReferral={data.creditsPerReferral} onClose={() => setShowModal(false)} />}

      <button
        onClick={() => setShowModal(true)}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-[#FFB547]/[0.1] to-[#8B7CFF]/[0.06] p-3 text-left ring-1 ring-[#FFB547]/20 transition-all hover:ring-[#FFB547]/40"
        style={{ fontFamily: FONT }}
      >
        <span className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-[#FFB547]/20 blur-2xl transition-opacity group-hover:opacity-100 opacity-60" />
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFB547]/15 ring-1 ring-[#FFB547]/30">
          <Gift className="h-4 w-4 text-[#FFB547]" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">Invite friends</span>
          {hasReferrals ? (
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#8A8FA3]">
              <Users className="h-3 w-3" />{data.totalReferrals} verified
              <span className="text-[#3E4253]">·</span>
              <span className="font-semibold text-[#FFB547]">+{data.creditsEarned} earned</span>
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-[11px] text-[#8A8FA3]">
              <span className="font-semibold text-[#FFB547]">+{data.creditsPerReferral} credits</span> per friend
            </span>
          )}
        </span>
        <ChevronRight className="relative h-4 w-4 shrink-0 text-[#6E7389] transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
      </button>
    </>
  );
}