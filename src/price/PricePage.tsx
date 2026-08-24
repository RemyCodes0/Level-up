"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Sparkles, Plus, Minus, MessageSquare } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { analytics } from "../lib/analytics";
import { PageMeta } from "../components/PageMeta";
import { getPricingConfig } from "../api/CourseApi";
import type { CourseTier } from "../api/CourseApi";

// No payment processor is live right now (no registered business yet — see
// notchpayController.js/stripeController.js, both unconfigured). Rather than
// show a checkout flow that would just fail, this page points people at the
// WhatsApp community instead. Revisit once a real processor is wired up.
const WHATSAPP_COMMUNITY_URL = "https://chat.whatsapp.com/CyuV45KQ9Au3awigE39jBC";

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

  useEffect(() => {
    analytics.pricingViewed();
    getPricingConfig()
      .then((cfg) => setCourseTiers(cfg.courseTiers))
      .catch((err) => console.error("Failed to load pricing config:", err));
  }, []);

  const faqs = [
    { q: "Is the first lesson really free?", a: "Yes. Every new account gets one full 6-lesson course free, with no card required, so you can see exactly what you'd get before spending any credits." },
    { q: "Do I need a subscription?", a: "No. There's no recurring charge, ever." },
    { q: "Do credits expire?", a: "Credits you earn from referrals never expire. The only exception is the 100 free credits every new account gets on signup — those expire 30 days after signup if unused." },
    { q: "Are quizzes extra?", a: "No — every course tier includes its MCQ quiz for free, bundled into the credit cost. There's never a separate charge for the quiz." },
    { q: "How do I get more credits?", a: "We're not set up to sell credit packs directly just yet. Join the Level Up WhatsApp community and message us — we'll sort you out. You can also earn credits for free by referring friends." },
  ];

  return (
    <div style={{ backgroundColor: STAGE, fontFamily: "'Inter', sans-serif" }} className="min-h-screen flex flex-col">
      <PageMeta
        title="Pricing — Credits for AI-Generated Courses | Level Up AI"
        description="Generate AI courses with Level Up: Quick Explainer, Deeper Dive, or Full Mastery. First course always free, no subscription — join our WhatsApp community for more credits."
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
            Your first course is on us.
          </h1>
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: MUTE }}>
            No subscription, no card required. Need more after that? Just reach out.
          </p>
        </div>

        {/* Free Trial + WhatsApp contact, 2 columns */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-stretch">
            {/* Free Trial — entry point for new users */}
            <div className="rounded-2xl p-6 text-center border flex flex-col" style={{ backgroundColor: STAGE_2, borderColor: HAIR }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: PHOSPHOR, fontFamily: "'JetBrains Mono', monospace" }}>Free Trial</p>
              <span className="text-4xl font-bold mb-1" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>$0</span>
              <p className="text-xs mb-6" style={{ color: MUTE }}>Your first course, on us</p>
              <p className="text-sm mb-6 flex-1" style={{ color: BEAM }}>1 full 6-lesson course + 20-question quiz — no card required.</p>
              <button onClick={() => navigate("/signup")} className="w-full text-sm font-semibold py-3 rounded-xl transition-transform hover:scale-[1.02] flex items-center justify-center gap-2" style={{ backgroundColor: PHOSPHOR, color: "#0a1f16" }}>
                Start free <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* We're not set up to sell credit packs directly yet (no
                registered business / payment processor live) — point people
                at the WhatsApp community to ask for more credits instead of
                showing a checkout that would just fail. */}
            <div className="rounded-2xl p-6 text-center border flex flex-col" style={{ backgroundColor: STAGE_2, borderColor: "rgba(61,224,160,0.35)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: PHOSPHOR, fontFamily: "'JetBrains Mono', monospace" }}>Need more?</p>
              <span className="text-4xl font-bold mb-1" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>💬</span>
              <p className="text-xs mb-6" style={{ color: MUTE }}>Just ask — we'll sort you out</p>
              <p className="text-sm mb-6 flex-1" style={{ color: BEAM }}>Join our WhatsApp community and message us for more credits. You can also earn credits free by referring friends.</p>
              <a
                href={WHATSAPP_COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-sm font-semibold py-3 rounded-xl transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                style={{ backgroundColor: PHOSPHOR, color: "#0a1f16" }}
              >
                <MessageSquare className="h-4 w-4" /> Join WhatsApp
              </a>
            </div>
          </div>
          <p className="text-center text-xs mt-6" style={{ color: MUTE }}>
            The 100 free signup credits expire 30 days after signup if unused. MCQs are always included free — no hidden fees.
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
