"use client";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, ArrowRight, Check, Play, Upload, Wand2, Trophy,
  X, Quote, Plus, Minus, Clock, Zap, ChevronRight,
} from "lucide-react";
import ShowcaseVideoGrid from "../components/ShowcaseVideoGrid";
import VideoShowcaseSection from "./VideoShowcaseSection";

const STAGE = "#15131F";
const STAGE_2 = "#1F1B2E";
const BEAM = "#F6F1E7";
const CORAL = "#FF5C49";
const PHOSPHOR = "#3DE0A0";
const AMBER = "#FFC24B";
const MUTE = "#9A95AC";
const HAIR = "rgba(246,241,231,0.10)";

function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, seen };
}
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return reduce;
}

function InteractiveDemo() {
  const [topic, setTopic] = useState("");
  const [building, setBuilding] = useState(false);
  const [builtFor, setBuiltFor] = useState<string | null>(null);
  const reduce = usePrefersReducedMotion();

  const lessonTitles = (t: string) => [
    `What ${t} actually means`,
    `The core mechanics of ${t}`,
    `${t} in the real world`,
    `Common mistakes with ${t}`,
    `Working through ${t} problems`,
    `Putting ${t} together`,
  ];

  const run = () => {
    const t = topic.trim();
    if (!t) return;
    setBuilding(true);
    setBuiltFor(null);
    setTimeout(() => { setBuilding(false); setBuiltFor(t); }, reduce ? 0 : 1100);
  };

  const examples = ["Photosynthesis", "The French Revolution", "Neural networks", "Supply & demand"];
  const shown = builtFor || (building ? topic.trim() : "");

  return (
    <div className="rounded-2xl border overflow-hidden w-full" style={{ borderColor: HAIR, backgroundColor: STAGE_2 }}>
      <div className="p-4 sm:p-6 border-b" style={{ borderColor: HAIR }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255,92,73,0.15)", color: CORAL }}>
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: MUTE, fontFamily: "'JetBrains Mono', monospace" }}>Try it — no signup</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(); }}
            placeholder="Type anything you want to learn…"
            className="flex-1 min-w-0 px-4 h-12 rounded-xl text-sm outline-none border"
            style={{ backgroundColor: STAGE, borderColor: HAIR, color: BEAM }}
          />
          <button
            onClick={run}
            disabled={!topic.trim() || building}
            className="h-12 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] disabled:opacity-40 shrink-0"
            style={{ backgroundColor: CORAL, color: "#fff" }}
          >
            {building ? "Building…" : <><span>Build my course</span> <ChevronRight className="h-4 w-4" /></>}
          </button>
        </div>
        {!topic && !builtFor && (
          <div className="flex flex-wrap gap-2 mt-3">
            {examples.map((ex) => (
              <button key={ex} onClick={() => setTopic(ex)} className="text-xs px-3 py-1.5 rounded-full border transition-colors" style={{ borderColor: HAIR, color: MUTE }}>
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown && (
        <div className="p-4 sm:p-6">
          <p className="text-xs mb-4" style={{ color: MUTE, fontFamily: "'JetBrains Mono', monospace" }}>
            {building ? "// assembling 6 lessons…" : `// course outline for "${shown}"`}
          </p>
          <div className="space-y-2">
            {lessonTitles(shown).map((title, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg border transition-all"
                style={{ borderColor: HAIR, backgroundColor: STAGE, opacity: building ? 0.35 : 1, transitionDelay: reduce ? "0ms" : `${i * 90}ms` }}
              >
                <span className="text-xs w-6 shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", color: i === 0 ? PHOSPHOR : MUTE }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate" style={{ color: BEAM }}>{title}</span>
                {i === 0 ? (
                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "rgba(61,224,160,0.15)", color: PHOSPHOR }}>free</span>
                ) : (
                  <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: MUTE }} />
                )}
              </div>
            ))}
          </div>
          {builtFor && (
            <p className="text-xs mt-4 text-center" style={{ color: MUTE }}>
              This is just the outline. The real thing animates and narrates every lesson.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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

export default function LandingPage() {
  const navigate = useNavigate();
  const hero = useInView<HTMLDivElement>();
  const demo = useInView<HTMLDivElement>();

  const testimonials = [
    { quote: "I uploaded my organic chem slides the night before an exam and had six lessons that actually made the reactions move. The quiz caught two topics I'd have walked in blind on.", name: "Amara O.", role: "Pre-med undergrad" },
    { quote: "I teach myself things constantly and reading docs is slow. Typing a topic and getting a narrated, animated explainer in minutes is genuinely how I want to learn now.", name: "Daniel K.", role: "Self-taught developer" },
    { quote: "The free first lesson sold me — I could see exactly what I was paying for before spending anything. Bought three courses the same week.", name: "Priya R.", role: "Grad student" },
  ];

  const faqs = [
    { q: "How long does a course take to generate?", a: "Your first lesson is usually ready in about five minutes. The remaining lessons keep building in the background while you watch, so you're never stuck waiting for the whole thing." },
    { q: "What can I make a course about?", a: "Anything you can describe in a sentence, or anything in a PDF you upload — lecture slides, a textbook chapter, your own notes. The course is built specifically around that material." },
    { q: "Is the first lesson really free?", a: "Yes. Every course's first lesson generates free, with no card required, so you can see exactly what you'd get before paying for the rest." },
    { q: "Do I need a subscription?", a: "No. You buy a course only when you want one. There's no recurring charge — one price, one course, whenever you need it." },
    { q: "What's actually in a course?", a: "Six animated video lessons with synced narration, plus a 20-question quiz that scores your readiness and breaks down what to review." },
  ];

  return (
    // overflow-x-hidden on both wrapper and root prevents horizontal scroll
    // at any browser zoom level — the key fix for the Ctrl+/- layout issue.
    <div style={{ backgroundColor: STAGE, fontFamily: "'Inter', sans-serif" }} className="min-h-screen w-full overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        ::selection { background: ${CORAL}; color: #fff; }
        html { scroll-behavior: smooth; overflow-x: hidden; }
        body { overflow-x: hidden; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-md border-b w-full" style={{ backgroundColor: "rgba(21,19,31,0.8)", borderColor: HAIR }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt="Level Up" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-semibold text-sm" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>Level Up</span>
          </div>
          <div className="hidden md:flex items-center gap-5 text-sm min-w-0 overflow-hidden" style={{ color: MUTE }}>
            <a href="#how" className="hover:opacity-80 whitespace-nowrap">How it works</a>
            <a href="#compare" className="hover:opacity-80 whitespace-nowrap">Why it's different</a>
            <a href="#pricing" className="hover:opacity-80 whitespace-nowrap">Pricing</a>
            <a href="#faq" className="hover:opacity-80 whitespace-nowrap">FAQ</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button onClick={() => navigate("/login")} className="text-sm font-medium hidden sm:inline whitespace-nowrap" style={{ color: MUTE }}>Log in</button>
            <button onClick={() => navigate("/ai_tutor")} className="text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg transition-transform hover:scale-[1.03] whitespace-nowrap" style={{ backgroundColor: CORAL, color: "#fff" }}>
              Start free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section ref={hero.ref} className="w-full px-4 sm:px-6 pt-14 sm:pt-20 pb-10">
        <div className="max-w-3xl mx-auto text-center">
          <div className={`transition-all duration-700 ${hero.seen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6" style={{ backgroundColor: "rgba(255,92,73,0.13)", color: CORAL }}>
              <Sparkles className="h-3 w-3 shrink-0" /> The first lesson is always free
            </div>
            {/* clamp() makes the heading fluid at any zoom level */}
            <h1 className="font-bold leading-[1.05] mb-6" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2rem, 6vw, 3.75rem)" }}>
              Stop cramming. <br />
              <span style={{ color: CORAL }}>Learn visually.</span>
            </h1>
            <p className="leading-relaxed mb-8 max-w-xl mx-auto" style={{ color: MUTE, fontSize: "clamp(0.95rem, 2vw, 1.125rem)" }}>
              Type a topic or upload your notes. Level Up renders six narrated, animated video lessons and a readiness quiz — the kind of course you'd wish someone had made for you, built in minutes.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <button onClick={() => navigate("/ai_tutor")} className="flex items-center gap-2 text-sm font-semibold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl transition-transform hover:scale-[1.02]" style={{ backgroundColor: CORAL, color: "#fff" }}>
                Generate your first lesson <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => navigate("/ai_showcase")} className="flex items-center gap-2 text-sm font-medium px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl border transition-colors" style={{ borderColor: HAIR, color: BEAM }}>
                <Play className="h-4 w-4" /> See a live demo
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-8 text-xs" style={{ color: MUTE }}>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0" style={{ color: PHOSPHOR }} /> No card for lesson one</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0" style={{ color: PHOSPHOR }} /> No subscription</span>
            </div>
          </div>
        </div>
      </section>

      {/* App walkthrough */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <VideoShowcaseSection />
      </section>

      {/* Real lesson videos */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>Real lessons, real courses</p>
          <h2 className="text-2xl sm:text-4xl font-bold mb-3 max-w-xl mx-auto" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
            Not a mockup. This is what gets made.
          </h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: MUTE }}>
            Six lessons, generated by Level Up, across six different topics. Press play.
          </p>
        </div>
        <ShowcaseVideoGrid />
      </section>

      {/* Marquee strip */}
      <div className="border-y w-full overflow-hidden" style={{ borderColor: HAIR }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" style={{ color: MUTE, fontFamily: "'JetBrains Mono', monospace" }}>
          <span>6 animated lessons</span><span style={{ color: CORAL }}>/</span>
          <span>synced narration</span><span style={{ color: CORAL }}>/</span>
          <span>20-question quiz</span><span style={{ color: CORAL }}>/</span>
          <span>topic or PDF</span><span style={{ color: CORAL }}>/</span>
          <span>ready in ~5 min</span>
        </div>
      </div>

      {/* How it works */}
      <section id="how" className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>How it works</p>
        <h2 className="text-2xl sm:text-4xl font-bold mb-12 sm:mb-14 max-w-xl" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
          A finished course on a single timeline.
        </h2>
        <div className="relative">
          <div className="hidden sm:block absolute left-0 right-0 top-[22px] h-px" style={{ backgroundColor: HAIR }} />
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6 relative">
            {[
              { icon: <Upload className="h-4 w-4" />, title: "Type a topic or upload a PDF", body: "A sentence, lecture slides, or a full textbook chapter — Level Up builds the course around your exact material." },
              { icon: <Wand2 className="h-4 w-4" />, title: "Watch it render", body: "Six animated, narrated lessons assemble in minutes. Lesson one plays while the rest keep building." },
              { icon: <Trophy className="h-4 w-4" />, title: "Score your readiness", body: "A 20-question quiz breaks down your strengths and the exact topics worth another pass." },
            ].map((s, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 relative z-10 border" style={{ backgroundColor: STAGE_2, borderColor: HAIR, color: CORAL }}>{s.icon}</div>
                </div>
                <h3 className="text-base sm:text-lg font-semibold mb-1.5" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTE }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive demo */}
      <section id="demo" ref={demo.ref} className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>Live demo</p>
          <h2 className="text-2xl sm:text-4xl font-bold mb-3" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>See what you'd get.</h2>
          <p className="text-sm" style={{ color: MUTE }}>Type a topic and watch the course outline assemble — no account needed.</p>
        </div>
        <div className={`transition-all duration-700 ${demo.seen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <InteractiveDemo />
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>Why it's different</p>
        <h2 className="text-2xl sm:text-4xl font-bold mb-10 sm:mb-12 max-w-xl" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
          Most studying is reading. This is watching.
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl p-5 sm:p-7 border" style={{ borderColor: HAIR, backgroundColor: STAGE_2 }}>
            <p className="text-xs uppercase tracking-widest mb-5" style={{ color: MUTE, fontFamily: "'JetBrains Mono', monospace" }}>The old way</p>
            <div className="space-y-3.5">
              {["Re-reading dense notes hoping it sticks", "Generic videos that never match your exact material", "No idea what you've actually mastered", "Hours to find, watch, and piece together sources"].map((t) => (
                <div key={t} className="flex items-start gap-3 text-sm" style={{ color: MUTE }}>
                  <X className="h-4 w-4 mt-0.5 shrink-0 opacity-60" /> {t}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl p-5 sm:p-7 border" style={{ borderColor: "rgba(61,224,160,0.3)", backgroundColor: "rgba(61,224,160,0.04)" }}>
            <p className="text-xs uppercase tracking-widest mb-5" style={{ color: PHOSPHOR, fontFamily: "'JetBrains Mono', monospace" }}>With Level Up</p>
            <div className="space-y-3.5">
              {["Animated lessons that show the concept moving", "Built from your topic or your own uploaded notes", "A quiz that scores exactly what to review", "A full course in minutes, not an afternoon"].map((t) => (
                <div key={t} className="flex items-start gap-3 text-sm" style={{ color: BEAM }}>
                  <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: PHOSPHOR }} /> {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>What learners say</p>
        <h2 className="text-2xl sm:text-4xl font-bold mb-10 sm:mb-12 max-w-xl" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
          Built for the way people actually study.
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <div key={i} className="rounded-2xl p-5 sm:p-6 border flex flex-col" style={{ borderColor: HAIR, backgroundColor: STAGE_2 }}>
              <Quote className="h-5 w-5 mb-4 shrink-0" style={{ color: CORAL }} />
              <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: BEAM }}>{t.quote}</p>
              <div>
                <p className="text-sm font-semibold" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>{t.name}</p>
                <p className="text-xs" style={{ color: MUTE }}>{t.role}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-6 text-center" style={{ color: MUTE }}>Illustrative of early learner feedback.</p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="max-w-md mx-auto rounded-2xl p-6 sm:p-8 text-center border" style={{ backgroundColor: STAGE_2, borderColor: "rgba(255,92,73,0.3)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: AMBER, fontFamily: "'JetBrains Mono', monospace" }}>Simple pricing</p>
          <div className="flex items-end justify-center gap-1 mb-1">
            <span className="font-bold" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2.5rem, 8vw, 3.75rem)" }}>$4.99</span>
          </div>
          <p className="text-sm mb-7" style={{ color: MUTE }}>per course — six lessons, narration, and a full quiz</p>
          <div className="space-y-3 text-left mb-8">
            {["First lesson of every course, free", "No subscription — pay per course, when you want one", "Upload a PDF or type any topic", "Keep every course you make"].map((t) => (
              <div key={t} className="flex items-start gap-2.5 text-sm" style={{ color: BEAM }}>
                <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: PHOSPHOR }} /> {t}
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/signup")} className="w-full text-sm font-semibold py-3.5 rounded-xl transition-transform hover:scale-[1.02]" style={{ backgroundColor: CORAL, color: "#fff" }}>
            Start your free lesson
          </button>
          <p className="text-xs mt-4" style={{ color: MUTE }}>No card required to begin.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>Questions</p>
        <h2 className="text-2xl sm:text-4xl font-bold mb-10" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
          Everything you might be wondering.
        </h2>
        <div>{faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}</div>
      </section>

      {/* Final CTA */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="rounded-3xl p-8 sm:p-16 text-center relative overflow-hidden border" style={{ borderColor: HAIR, backgroundColor: STAGE_2 }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(100% 100% at 50% 0%, rgba(255,92,73,0.12), transparent 55%)" }} />
          <div className="relative">
            <Zap className="h-8 w-8 mx-auto mb-5" style={{ color: AMBER }} />
            <h2 className="font-bold mb-4 max-w-2xl mx-auto leading-[1.08]" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.75rem, 5vw, 3rem)" }}>
              Your first lesson is one topic away.
            </h2>
            <p className="text-sm sm:text-base mb-8 max-w-md mx-auto" style={{ color: MUTE }}>
              Type what you want to learn and watch it become a course. Free to start, no card needed.
            </p>
            <button onClick={() => navigate("/signup")} className="inline-flex items-center gap-2 text-sm font-semibold px-6 sm:px-7 py-3.5 sm:py-4 rounded-xl transition-transform hover:scale-[1.02]" style={{ backgroundColor: CORAL, color: "#fff" }}>
              Get started free <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t w-full" style={{ borderColor: HAIR }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Level Up" className="h-5 w-5 rounded object-cover" />
            <span className="text-sm font-medium" style={{ color: MUTE }}>Level Up</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs" style={{ color: MUTE }}>
            <a href="/terms.html" className="hover:opacity-80">Terms</a>
            <a href="/privacy-policy.html" className="hover:opacity-80">Privacy</a>
            <a href="/refund-policy.html" className="hover:opacity-80">Refunds</a>
            <a href="/login" className="hover:opacity-80">Log in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}