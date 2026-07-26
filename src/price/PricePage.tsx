"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Sparkles, Plus, Minus, Loader2 } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { analytics } from "../lib/analytics";
import { PageMeta } from "../components/PageMeta";
import { getPricingConfig } from "../api/CourseApi";
import type { CourseTier, CreditPack } from "../api/CourseApi";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

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
  const [courseTiers, setCourseTiers] = useState<CourseTier[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [buyingPackKey, setBuyingPackKey] = useState<string | null>(null);

  useEffect(() => {
    analytics.pricingViewed();
    getPricingConfig()
      .then((cfg) => { setCourseTiers(cfg.courseTiers); setCreditPacks(cfg.creditPacks); })
      .catch((err) => console.error("Failed to load pricing config:", err));
  }, []);

  const handleBuy = async (packKey: string) => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/signup"); return; }
    setBuyingPackKey(packKey);
    try {
      const res = await fetch(`${BASE_URL}/api/payment/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) throw new Error(data.message || "Failed to start checkout");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error("Failed to start checkout:", err);
      setBuyingPackKey(null);
    }
  };

  const faqs = [
    { q: "Is the first lesson really free?", a: "Yes. Every new account gets one full 6-lesson course free, with no card required, so you can see exactly what you'd get before spending any credits." },
    { q: "Do I need a subscription?", a: "No. There's no recurring charge. You buy a credit pack only when you want one, and (with one exception below) credits never expire." },
    { q: "Do credits expire?", a: "Credits you buy or earn from referrals never expire. The only exception is the 100 free credits every new account gets on signup — those expire 30 days after signup if unused." },
    { q: "Are quizzes extra?", a: "No — every course tier includes its MCQ quiz for free, bundled into the credit cost. There's never a separate charge for the quiz." },
    { q: "Can I get a refund?", a: "Yes, within our refund policy window if a course didn't generate properly or doesn't match what was promised. See our refund policy for details." },
  ];

  return (
    <div style={{ backgroundColor: STAGE, fontFamily: "'Inter', sans-serif" }} className="min-h-screen flex flex-col">
      <PageMeta
        title="Pricing — Credits for AI-Generated Courses | Level Up AI"
        description="Buy credit packs for AI-generated courses: Quick Explainer, Deeper Dive, or Full Mastery. First course always free, no subscription, credits never expire."
        canonical="/price"
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          })}
        </script>
      </Helmet>
      <style>{`
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
            Credits that never expire.
          </h1>
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: MUTE }}>
            Buy credits once, spend them on any course tier, whenever you like. No recurring charge, no surprises.
          </p>
        </div>

        {/* Free Trial + 3 credit packs, 4 columns */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
            {/* Free Trial — leftmost, entry point for new users */}
            <div className="rounded-2xl p-6 text-center border flex flex-col" style={{ backgroundColor: STAGE_2, borderColor: HAIR }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: PHOSPHOR, fontFamily: "'JetBrains Mono', monospace" }}>Free Trial</p>
              <span className="text-4xl font-bold mb-1" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>$0</span>
              <p className="text-xs mb-6" style={{ color: MUTE }}>Your first course, on us</p>
              <p className="text-sm mb-6 flex-1" style={{ color: BEAM }}>1 full 6-lesson course + 20-question quiz — no card required.</p>
              <button onClick={() => navigate("/signup")} className="w-full text-sm font-semibold py-3 rounded-xl transition-transform hover:scale-[1.02] flex items-center justify-center gap-2" style={{ backgroundColor: PHOSPHOR, color: "#0a1f16" }}>
                Start free <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {creditPacks.map((p) => (
              <div key={p.key} className="rounded-2xl p-6 text-center border flex flex-col relative" style={{ backgroundColor: STAGE_2, borderColor: p.badge ? CORAL : "rgba(255,92,73,0.3)" }}>
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full" style={{ backgroundColor: CORAL, color: "#fff" }}>
                    {p.badge}
                  </span>
                )}
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: AMBER, fontFamily: "'JetBrains Mono', monospace" }}>{p.credits} Credits</p>
                <span className="text-4xl font-bold mb-1" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>${(p.priceCents / 100).toFixed(2)}</span>
                <p className="text-xs mb-6" style={{ color: MUTE }}>${(p.priceCents / 100 / p.credits).toFixed(3)} per credit</p>
                <div className="flex-1" />
                <button
                  onClick={() => handleBuy(p.key)}
                  disabled={buyingPackKey !== null}
                  className="w-full text-sm font-semibold py-3 rounded-xl transition-transform hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: CORAL, color: "#fff" }}
                >
                  {buyingPackKey === p.key ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</> : <>Buy <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-xs mt-6" style={{ color: MUTE }}>
            Credits never expire, except the 100 free signup credits, which expire 30 days after signup. MCQs are always included free — no hidden fees.
          </p>
        </div>

        {/* Course tiers explainer */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-2 text-center" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
            What your credits buy
          </h2>
          <p className="text-sm text-center mb-8" style={{ color: MUTE }}>Pick a course size right in the app when you generate — here's what each one costs.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {courseTiers.map((t) => (
              <div key={t.key} className="rounded-2xl p-6 border" style={{ backgroundColor: STAGE_2, borderColor: HAIR }}>
                <h3 className="text-lg font-bold mb-1" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>{t.name}</h3>
                <p className="text-sm mb-4" style={{ color: MUTE }}>{t.description}</p>
                <div className="space-y-2 text-sm mb-5" style={{ color: BEAM }}>
                  <div className="flex items-start gap-2.5"><Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: PHOSPHOR }} /> {t.lessonCount} animated, narrated lesson{t.lessonCount !== 1 ? "s" : ""}</div>
                  <div className="flex items-start gap-2.5"><Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: PHOSPHOR }} /> {t.mcqCount}-question quiz ({t.timeAllocationMinutes} min), included free</div>
                </div>
                <p className="text-2xl font-bold" style={{ color: AMBER, fontFamily: "'Space Grotesk', sans-serif" }}>{t.creditCost} credits</p>
              </div>
            ))}
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
