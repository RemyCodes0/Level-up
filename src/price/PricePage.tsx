"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Sparkles, Plus, Minus } from "lucide-react";
import { analytics } from "../lib/analytics";

// Same "Cutting Room" tokens used across the rest of the site, for
// consistency when a visitor lands here directly (e.g. from an ad or a
// shared link) rather than navigating in from the main landing page.
const STAGE = "#15131F";
const STAGE_2 = "#1F1B2E";
const BEAM = "#F6F1E7";
const CORAL = "#FF5C49";
const PHOSPHOR = "#3DE0A0";
const AMBER = "#FFC24B";
const MUTE = "#9A95AC";
const HAIR = "rgba(246,241,231,0.10)";

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b" style={{ borderColor: HAIR }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-4 py-5 text-left">
        <span className="text-sm sm:text-base font-medium" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>{q}</span>
        {open ? <Minus className="h-4 w-4 shrink-0" style={{ color: CORAL }} /> : <Plus className="h-4 w-4 shrink-0" style={{ color: MUTE }} />}
      </button>
      {open && <p className="text-sm leading-relaxed pb-5 pr-8" style={{ color: MUTE }}>{a}</p>}
    </div>
  );
}

export default function PricingPage() {
  const navigate = useNavigate();

  useEffect(() => { analytics.pricingViewed(); }, []);

  const faqs = [
    { q: "Is the first lesson really free?", a: "Yes. Every course's first lesson generates free, with no card required, so you can see exactly what you'd get before paying for the rest." },
    { q: "Do I need a subscription?", a: "No. There's no recurring charge. You buy a course credit only when you want one, and it never expires." },
    { q: "What exactly does $4.99 get me?", a: "One full course: six animated video lessons with synced narration, plus a 20-question quiz that scores your readiness and breaks down what to review." },
    { q: "Can I get a refund?", a: "Yes, within our refund policy window if a course didn't generate properly or doesn't match what was promised. See our refund policy for details." },
    { q: "Can I buy more than one course at a time?", a: "Yes. You can purchase credits whenever you like and use them on any topic, anytime — there's no limit on how many courses you make." },
  ];

  return (
    <div style={{ backgroundColor: STAGE, fontFamily: "'Inter', sans-serif" }} className="min-h-screen flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        ::selection { background: ${CORAL}; color: #fff; }
      `}</style>

      {/* Nav */}
      <nav className="border-b" style={{ borderColor: HAIR }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src="/logo.png" alt="Level Up" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-semibold text-sm" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>Level Up</span>
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/login")} className="text-sm font-medium hidden sm:inline" style={{ color: MUTE }}>Log in</button>
            <button onClick={() => navigate("/signup")} className="text-sm font-semibold px-4 py-2 rounded-lg transition-transform hover:scale-[1.03]" style={{ backgroundColor: CORAL, color: "#fff" }}>
              Start free
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Heading */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6" style={{ backgroundColor: "rgba(255,92,73,0.13)", color: CORAL }}>
            <Sparkles className="h-3 w-3" /> No subscription, ever
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.08] mb-4" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
            One simple price.
          </h1>
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: MUTE }}>
            Pay only for the courses you make. No tiers, no recurring charge, no surprises.
          </p>
        </div>

        {/* Pricing card */}
        <div className="max-w-md mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl p-8 text-center border" style={{ backgroundColor: STAGE_2, borderColor: "rgba(255,92,73,0.3)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: AMBER, fontFamily: "'JetBrains Mono', monospace" }}>Per course</p>
            <div className="flex items-end justify-center gap-1 mb-1">
              <span className="text-6xl font-bold" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>$4.99</span>
            </div>
            <p className="text-sm mb-7" style={{ color: MUTE }}>six lessons, narration, and a full quiz</p>
            <div className="space-y-3 text-left mb-8">
              {[
                "First lesson of every course, free",
                "No subscription — pay per course, when you want one",
                "Upload a PDF or type any topic",
                "6 animated, narrated video lessons",
                "A 20-question readiness quiz",
                "Keep every course you make, forever",
              ].map((t) => (
                <div key={t} className="flex items-start gap-2.5 text-sm" style={{ color: BEAM }}>
                  <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: PHOSPHOR }} /> {t}
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/signup")} className="w-full text-sm font-semibold py-3.5 rounded-xl transition-transform hover:scale-[1.02] flex items-center justify-center gap-2" style={{ backgroundColor: CORAL, color: "#fff" }}>
              Start your free lesson <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-xs mt-4" style={{ color: MUTE }}>No card required to begin.</p>
          </div>
        </div>

        {/* Billing FAQ */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-20">
          <h2 className="text-xl sm:text-2xl font-bold mb-2 text-center" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
            Billing questions
          </h2>
          <p className="text-sm text-center mb-8" style={{ color: MUTE }}>Everything about how pricing actually works.</p>
          <div>{faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}</div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: HAIR }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Level Up" className="h-5 w-5 rounded object-cover" />
            <span className="text-sm font-medium" style={{ color: MUTE }}>Level Up</span>
          </div>
          <div className="flex items-center gap-6 text-xs" style={{ color: MUTE }}>
            <a href="/terms.html" className="hover:opacity-80">Terms</a>
            <a href="/privacy-policy.html" className="hover:opacity-80">Privacy</a>
            <a href="/refund-policy.html" className="hover:opacity-80">Refunds</a>
          </div>
        </div>
      </footer>
    </div>
  );
}