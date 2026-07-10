// components/ReferralCard.tsx
import { useState, useEffect } from "react";
import { Copy, Check, Users, Gift, X, ArrowRight, Sparkles } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface ReferralData {
  code: string;
  link: string;
  totalReferrals: number;
  progressInCycle: number;
  creditsEarned: number;
  nextCreditAt: number;
}

function ReferralModal({ link, onClose }: { link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(link); }
    catch {
      const input = document.createElement("input");
      input.value = link; document.body.appendChild(input);
      input.select(); document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const steps = [
    { number: "01", title: "Share your link", description: "Send your invite link to a friend via WhatsApp, text, or email." },
    { number: "02", title: "Friend signs up", description: "They create a free Level Up account using your link." },
    { number: "03", title: "Friend verifies their email", description: "They click the confirmation link in their inbox — the same step everyone does to log in." },
    { number: "04", title: "You earn a credit", description: "After 3 friends do this, 1 free course credit lands in your account. Then it resets — 3 more friends, another credit." },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/*
        Bottom sheet on mobile, centered card on desktop.
        - max-h-[92dvh] + flex-col keeps the whole modal inside the viewport,
          so the header and the copy button are never clipped off-screen.
          (dvh — dynamic viewport height — accounts for mobile browser chrome
          appearing/disappearing, unlike vh which the URL bar can cover.)
        - The middle section scrolls; the header and the link+copy footer stay
          pinned, so the primary action is always reachable without scrolling.
        - pb-[env(safe-area-inset-bottom)] clears the iOS home indicator.
      */}
      <div className="flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl">
        {/* Gradient header — pinned */}
        <div className="relative shrink-0 p-5 pb-4 sm:p-6 sm:pb-5" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)" }}>
          {/* Drag-handle affordance — mobile only, signals the sheet is dismissible */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/40 sm:hidden" />
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <Gift className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-1 pr-9">Invite friends, earn credits</h2>
          <p className="text-purple-200 text-sm">Every 3 friends who sign up = 1 free course credit. No limit.</p>
        </div>

        {/* Scrollable middle: steps + warning */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Steps */}
          <div className="p-5 space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shrink-0 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: i === 3 ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                    {step.number}
                  </div>
                  {i < steps.length - 1 && <div className="w-px h-3 mt-1 bg-slate-200" />}
                </div>
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Warning */}
          <div className="mx-5 mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
            <span className="text-amber-500 shrink-0 mt-0.5">⚠️</span>
            <p className="text-xs text-amber-700 leading-relaxed">
              <span className="font-semibold">Remember:</span> your friend needs to verify their email (the confirmation link we send them) for your credit to count. Just entering their details without confirming won't trigger it.
            </p>
          </div>
        </div>

        {/* Link + copy — pinned footer, always reachable */}
        <div className="shrink-0 border-t border-slate-100 px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-2">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 border border-slate-200">
            <span className="text-xs flex-1 truncate font-mono text-slate-500">{link}</span>
          </div>
          <button onClick={handleCopy}
            className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{
              background: copied ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              boxShadow: copied ? "0 4px 14px rgba(34,197,94,0.4)" : "0 4px 14px rgba(99,102,241,0.4)",
            }}>
            {copied ? <><Check className="h-4 w-4" /> Copied! Send it to your friends</> : <><Copy className="h-4 w-4" /> Copy my invite link</>}
          </button>
        </div>
      </div>
    </div>
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

  const progress = data.progressInCycle;

  return (
    <>
      {showModal && <ReferralModal link={data.link} onClose={() => setShowModal(false)} />}

      <div className="mx-3 mb-3 rounded-2xl overflow-hidden border border-purple-200 shadow-sm"
        style={{ background: "linear-gradient(135deg, #f5f3ff, #ede9fe)" }}>

        {/* Top accent bar */}
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)" }} />

        <div className="p-3.5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <Gift className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800">Invite friends, earn credits</p>
              <p className="text-xs text-purple-600 font-medium">3 friends = 1 free course</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-1.5 mb-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex-1 h-2 rounded-full transition-all duration-500"
                style={{ background: i < progress ? "linear-gradient(90deg, #6366f1, #8b5cf6)" : "rgba(99,102,241,0.15)" }} />
            ))}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {progress === 0 && data.totalReferrals === 0 ? "Invite 3 friends to earn a free credit" :
             progress === 0 ? `🎉 ${data.creditsEarned} credit${data.creditsEarned !== 1 ? "s" : ""} earned — keep going!` :
             `${progress}/3 friends joined · ${data.nextCreditAt} more to go`}
          </p>

          {/* CTA */}
          <button onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 2px 8px rgba(99,102,241,0.4)" }}>
            <Sparkles className="h-3.5 w-3.5" />
            Invite a friend & earn a credit
            <ArrowRight className="h-3.5 w-3.5 ml-auto" />
          </button>

          {/* Stats */}
          {data.totalReferrals > 0 && (
            <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-purple-200">
              <span className="text-xs flex items-center gap-1 text-slate-500">
                <Users className="h-3 w-3" />{data.totalReferrals} joined
              </span>
              <span className="text-xs font-bold text-purple-700">
                {data.creditsEarned} credit{data.creditsEarned !== 1 ? "s" : ""} earned
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}