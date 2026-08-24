"use client";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight, Upload, Wand2, Trophy,
  Quote, Plus, Minus, Zap,
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
const HAIR_STRONG = "rgba(246,241,231,0.22)";

const DISPLAY = "'Space Grotesk', sans-serif";
const MONO = "'JetBrains Mono', monospace";

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

// A live mm:ss readout, ticking once a second — the hero's chrome bar reads
// like a monitor that's actually rolling, not a static screenshot of one.
function useElapsedClock() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── The hero's living background: a phosphor dot grid — literally what
// PHOSPHOR names — that flickers ambiently, brightens near the pointer, and
// gets swept by a slow scanline, like a broadcast monitor warming up.
// Native canvas, no dependency; pauses its own rAF loop when off-screen or
// tab-hidden, draws one static frame under reduced motion.
function StudioCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const handler = () => setReduce(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rect = container.getBoundingClientRect();
    let raf = 0;
    let running = false;
    const mouse = { x: -9999, y: -9999 };

    function resize() {
      rect = container!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.round(rect.width * dpr));
      canvas!.height = Math.max(1, Math.round(rect.height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function onMove(e: MouseEvent) { mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; }
    function onLeave() { mouse.x = -9999; mouse.y = -9999; }

    const SPACING = 32;
    function drawStatic() {
      const w = rect.width, h = rect.height;
      ctx!.clearRect(0, 0, w, h);
      for (let x = SPACING / 2; x < w; x += SPACING) {
        for (let y = SPACING / 2; y < h; y += SPACING) {
          ctx!.beginPath();
          ctx!.arc(x, y, 1, 0, Math.PI * 2);
          ctx!.fillStyle = "rgba(246,241,231,0.16)";
          ctx!.fill();
        }
      }
    }

    function draw(time: number) {
      const w = rect.width, h = rect.height;
      ctx!.clearRect(0, 0, w, h);
      for (let x = SPACING / 2; x < w; x += SPACING) {
        for (let y = SPACING / 2; y < h; y += SPACING) {
          const dx = x - mouse.x, dy = y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const glow = Math.max(0, 1 - dist / 230);
          const flicker = 0.28 + 0.14 * Math.sin(time / 1500 + x * 0.018 + y * 0.021);
          const alpha = Math.min(0.95, flicker + glow * 0.7);
          const r = 1 + glow * 1.8;
          ctx!.beginPath();
          ctx!.arc(x, y, r, 0, Math.PI * 2);
          ctx!.fillStyle = glow > 0.04 ? `rgba(61,224,160,${alpha})` : `rgba(246,241,231,${alpha * 0.55})`;
          ctx!.fill();
        }
      }
      const period = h + 260;
      const sweepY = ((time / 14) % period) - 130;
      const grad = ctx!.createLinearGradient(0, sweepY - 70, 0, sweepY + 70);
      grad.addColorStop(0, "rgba(61,224,160,0)");
      grad.addColorStop(0.5, "rgba(61,224,160,0.055)");
      grad.addColorStop(1, "rgba(61,224,160,0)");
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, sweepY - 70, w, 140);
      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (running || reduce) return;
      running = true;
      window.addEventListener("mousemove", onMove, { passive: true });
      container!.addEventListener("mouseleave", onLeave);
      raf = requestAnimationFrame(draw);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      container!.removeEventListener("mouseleave", onLeave);
    }

    if (reduce) {
      drawStatic();
      const onResizeStatic = () => { resize(); drawStatic(); };
      window.addEventListener("resize", onResizeStatic);
      return () => window.removeEventListener("resize", onResizeStatic);
    }

    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) start(); else stop(); }, { threshold: 0.05 });
    io.observe(container);
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVis);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      stop();
    };
  }, [reduce]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const clock = useElapsedClock();
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [heroPrompt, setHeroPrompt] = useState("");

  useEffect(() => { const id = requestAnimationFrame(() => setHeroLoaded(true)); return () => cancelAnimationFrame(id); }, []);

  // Sends the visitor straight to generating THIS topic instead of a bare
  // "sign up, then figure out what to type" flow. Logged-in visitors land
  // on /ai_tutor directly; everyone else goes through /signup, which
  // already redirects to /ai_tutor on success — either way the topic is
  // waiting in the input, pre-filled and focused (see AiTutor.tsx's pickup
  // effect), so the only thing left to do is press Enter.
  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = heroPrompt.trim();
    if (!value) return;
    localStorage.setItem("levelup_pending_prompt", value);
    const loggedIn = !!localStorage.getItem("token");
    navigate(loggedIn ? "/ai_tutor" : "/signup");
  };

  const testimonials = [
    { quote: "I uploaded my organic chem slides the night before an exam and had six lessons that actually made the reactions move. The quiz caught two topics I'd have walked in blind on.", name: "Amara O.", role: "Pre-med undergrad" },
    { quote: "I teach myself things constantly and reading docs is slow. Typing a topic and getting a narrated, animated explainer in minutes is genuinely how I want to learn now.", name: "Daniel K.", role: "Self-taught developer" },
    { quote: "The free first lesson sold me — I could see exactly what I'd get before using any credits. Went through three courses the same week.", name: "Priya R.", role: "Grad student" },
  ];

  const faqs = [
    { q: "How long does a course take to generate?", a: "Your first lesson is usually ready in about five minutes. The remaining lessons keep building in the background while you watch, so you're never stuck waiting for the whole thing." },
    { q: "What can I make a course about?", a: "Anything you can describe in a sentence, or anything in a PDF you upload — lecture slides, a textbook chapter, your own notes. The course is built specifically around that material." },
    { q: "Is the first lesson really free?", a: "Yes. Every course's first lesson generates free, with no card required, so you can see exactly what a course looks like before spending any credits." },
    { q: "Do I need a subscription?", a: "No, and there's no purchase flow at all right now. Every new account starts with 100 free credits — need more after that, just message us." },
    { q: "What's actually in a course?", a: "Six animated video lessons with synced narration, plus a 20-question quiz that scores your readiness and breaks down what to review." },
  ];

  return (
    // overflow-x-hidden on both wrapper and root prevents horizontal scroll
    // at any browser zoom level — the key fix for the Ctrl+/- layout issue.
    <>
    <Helmet>
      {/* ── Primary ── */}
      <title>Level Up AI — Turn Any Topic Into Animated Video Lessons</title>
      <meta name="description" content="Type a topic or upload your notes. Level Up AI generates 6 animated, narrated video lessons and a 20-question quiz in minutes. First lesson always free." />
      <meta name="keywords" content="AI learning, animated video lessons, AI course generator, study tool, personalized learning, AI tutor, educational AI, learn visually, PDF to course" />
      <meta name="author" content="Level Up AI" />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href="https://leveluppedu.app" />

      {/* ── Open Graph (Facebook, LinkedIn, WhatsApp) ── */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Level Up AI" />
      <meta property="og:title" content="Level Up AI — Turn Any Topic Into Animated Video Lessons" />
      <meta property="og:description" content="Type a topic or upload your PDF. In minutes you get 6 animated lessons with narration and a quiz that scores your readiness. First lesson free, no card needed." />
      <meta property="og:url" content="https://leveluppedu.app" />
      <meta property="og:image" content="https://leveluppedu.app/logo.png" />
      <meta property="og:image:alt" content="Level Up AI logo" />
      <meta property="og:locale" content="en_US" />

      {/* ── Twitter / X Card ── */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@levelupai" />
      <meta name="twitter:title" content="Level Up AI — Turn Any Topic Into Animated Video Lessons" />
      <meta name="twitter:description" content="Type a topic or upload your PDF. Get 6 animated lessons with narration and a quiz in minutes. First lesson always free." />
      <meta name="twitter:image" content="https://leveluppedu.app/logo.png" />
      <meta name="twitter:image:alt" content="Level Up AI logo" />

      {/* ── Structured Data: WebApplication ── */}
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Level Up AI",
        "url": "https://leveluppedu.app",
        "description": "AI-powered platform that generates personalized animated video courses from any topic or PDF. Includes 6 animated lessons with narration and a 20-question readiness quiz.",
        "applicationCategory": "EducationApplication",
        "operatingSystem": "Web",
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "33"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Level Up AI",
          "url": "https://leveluppedu.app",
          "logo": {
            "@type": "ImageObject",
            "url": "https://leveluppedu.app/logo.png"
          }
        }
      })}</script>

      {/* ── Structured Data: Organization (separate top-level entity, not just
           nested under WebApplication.publisher — this is what Google's docs
           point to for brand/Knowledge Panel eligibility) ── */}
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Level Up AI",
        "url": "https://leveluppedu.app",
        "logo": "https://leveluppedu.app/logo.png",
        "description": "Level Up AI turns any topic or PDF into animated, narrated video courses with a readiness quiz."
      })}</script>

      {/* ── Structured Data: FAQPage (matches your FAQ section) ── */}
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How long does a course take to generate?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Your first lesson is usually ready in about five minutes. The remaining lessons keep building in the background while you watch, so you're never stuck waiting for the whole thing."
            }
          },
          {
            "@type": "Question",
            "name": "What can I make a course about?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Anything you can describe in a sentence, or anything in a PDF you upload — lecture slides, a textbook chapter, your own notes. The course is built specifically around that material."
            }
          },
          {
            "@type": "Question",
            "name": "Is the first lesson really free?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Every course's first lesson generates free, with no card required, so you can see exactly what a course looks like before spending any credits."
            }
          },
          {
            "@type": "Question",
            "name": "Do I need a subscription?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No, and there's no purchase flow at all right now. Every new account starts with 100 free credits — need more after that, just message us."
            }
          },
          {
            "@type": "Question",
            "name": "What's actually in a course?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Six animated video lessons with synced narration, plus a 20-question quiz that scores your readiness and breaks down what to review."
            }
          }
        ]
      })}</script>
    </Helmet>
    <div style={{ backgroundColor: STAGE, fontFamily: "'Inter', sans-serif", minHeight: "100vh", width: "100%", maxWidth: "100vw" }} className="overflow-x-hidden">
      <style>{`
        ::selection { background: ${CORAL}; color: #fff; }
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100vh;
          scroll-behavior: smooth;
          overflow-x: hidden;
          background-color: ${STAGE};
        }
        * { box-sizing: border-box; }

        @keyframes lu-rec-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .lu-hero-input { transition: border-color 0.2s ease, background-color 0.2s ease; }
        .lu-hero-input:focus-within { border-color: rgba(61,224,160,0.5); background-color: rgba(31,27,46,0.85); }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
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

      {/* Hero — canvas-alive backdrop, prompt input as the sole CTA */}
      <section className="relative w-full min-h-[90vh] flex flex-col px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 60% at 50% 30%, rgba(61,224,160,0.05), transparent 60%)` }} />
        <StudioCanvas />
        <div className="relative flex-1 flex items-center justify-center pt-16 pb-10">
          <div
            className="max-w-2xl mx-auto text-center transition-all duration-[900ms]"
            style={{ opacity: heroLoaded ? 1 : 0, transform: heroLoaded ? "translateY(0)" : "translateY(16px)" }}
          >
            <div
              className="inline-flex items-center gap-2.5 sm:gap-3 text-[11px] font-medium px-3 py-1.5 rounded-full mb-7 border"
              style={{ backgroundColor: "rgba(21,19,31,0.6)", borderColor: HAIR_STRONG, color: MUTE, fontFamily: MONO }}
            >
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full" style={{ backgroundColor: CORAL, animation: "lu-rec-pulse 1.6s ease-in-out infinite" }} />
                </span>
                <span style={{ color: CORAL }}>REC</span>
              </span>
              <span className="w-px h-3" style={{ backgroundColor: HAIR_STRONG }} />
              <span className="tabular-nums">{clock}:14</span>
              <span className="w-px h-3 hidden sm:block" style={{ backgroundColor: HAIR_STRONG }} />
              <span className="hidden sm:inline" style={{ color: PHOSPHOR }}>LESSON ONE — FREE</span>
            </div>

            <h1 className="font-bold leading-[0.98] mb-6 tracking-tight" style={{ color: BEAM, fontFamily: DISPLAY, fontSize: "clamp(2.5rem, 8vw, 5rem)" }}>
              Stop cramming.<br />
              <span style={{ color: CORAL }}>Learn visually.</span>
            </h1>
            <p className="leading-relaxed mb-8 max-w-xl mx-auto" style={{ color: MUTE, fontSize: "clamp(0.95rem, 2vw, 1.15rem)" }}>
              Tell us what you're studying — Level Up turns it into six narrated, animated video lessons and a readiness quiz, built in minutes.
            </p>

            {/* The whole CTA: type it, hit enter. */}
            <form onSubmit={handleHeroSubmit} className="max-w-lg mx-auto">
              <div className="lu-hero-input flex items-center gap-2 rounded-2xl border p-1.5 sm:p-2" style={{ borderColor: HAIR_STRONG, backgroundColor: "rgba(31,27,46,0.6)" }}>
                <input
                  value={heroPrompt}
                  onChange={(e) => setHeroPrompt(e.target.value)}
                  placeholder="Explain photosynthesis, or upload your notes…"
                  aria-label="What do you want to learn?"
                  className="flex-1 bg-transparent border-0 outline-none px-3 sm:px-4 py-2.5 text-sm sm:text-base min-w-0"
                  style={{ color: BEAM }}
                />
                <button
                  type="submit"
                  disabled={!heroPrompt.trim()}
                  aria-label="Generate this lesson"
                  className="shrink-0 flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-xl transition-all disabled:opacity-40 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ backgroundColor: CORAL, color: "#fff", outlineColor: BEAM }}
                >
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
            </form>
            <p className="text-xs mt-4" style={{ color: MUTE }}>Free to start — we'll take you straight there.</p>
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

      {/* Comparison */}
      <section id="compare" className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>Why it's different</p>
        <h2 className="text-2xl sm:text-4xl font-bold mb-10 sm:mb-12 max-w-xl" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
          Most studying is reading. This is watching.
        </h2>
        <svg width="100%" viewBox="0 0 680 380" role="img" aria-label="Before and after: struggling with notes vs relaxed with Level Up" style={{ borderRadius: 16, display: "block" }}>
          <title>Before and after comparison</title>
          <desc>Left side shows a stressed person hunched over dense textbooks. Right side shows a relaxed person watching an animated lesson on a laptop.</desc>
          <defs>
            <style>{`
              @keyframes lu-sweat{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
              @keyframes lu-blink{0%,90%,100%{ry:5}95%{ry:1}}
              @keyframes lu-screen{0%,100%{opacity:.7}50%{opacity:1}}
              @keyframes lu-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
              @keyframes lu-bob{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(1deg)}}
              @keyframes lu-stress{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
              @keyframes lu-orbit{from{transform:rotate(0deg) translateX(18px) rotate(0deg)}to{transform:rotate(360deg) translateX(18px) rotate(-360deg)}}
              @keyframes lu-wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
            `}</style>
          </defs>

          <rect width="680" height="380" fill="#15131F" rx="16"/>
          <line x1="340" y1="0" x2="340" y2="380" stroke="rgba(246,241,231,0.08)" strokeWidth="1.5"/>

          <text x="130" y="32" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="10" fill="#9A95AC" letterSpacing="0.12em">THE OLD WAY</text>
          <text x="530" y="32" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="10" fill="#3DE0A0" letterSpacing="0.12em">WITH LEVEL UP</text>

          {/* Desk surface left */}
          <rect x="40" y="268" width="260" height="48" fill="#2a1f3d" rx="4"/>

          {/* Stressed person */}
          <g style={{ animation: "lu-stress 1.8s ease-in-out infinite", transformOrigin: "170px 200px" }}>
            <rect x="80" y="270" width="55" height="8" fill="#3a2d5a" rx="2"/>
            <rect x="148" y="258" width="70" height="10" fill="#3a2d5a" rx="2"/>
            <rect x="90" y="240" width="160" height="40" fill="#1a1330" rx="3" stroke="#3a2d5a" strokeWidth="0.5"/>
            <line x1="95" y1="248" x2="245" y2="248" stroke="#9A95AC" strokeWidth="0.4" strokeDasharray="3 3"/>
            <line x1="95" y1="255" x2="240" y2="255" stroke="#9A95AC" strokeWidth="0.4" strokeDasharray="3 3"/>
            <line x1="95" y1="262" x2="235" y2="262" stroke="#9A95AC" strokeWidth="0.4" strokeDasharray="3 3"/>
            <line x1="95" y1="269" x2="220" y2="269" stroke="#9A95AC" strokeWidth="0.4" strokeDasharray="3 3"/>
            <path d="M130 220 Q170 200 210 220" fill="#c8956a"/>
            <ellipse cx="170" cy="220" rx="42" ry="28" fill="#c8956a"/>
            <ellipse cx="152" cy="216" rx="6" ry="7" fill="white"/>
            <ellipse cx="188" cy="216" rx="6" ry="7" fill="white"/>
            <ellipse cx="153" cy="218" rx="3.5" ry="4.5" fill="#4a3020" style={{ animation: "lu-blink 3s ease-in-out infinite" }}/>
            <ellipse cx="189" cy="218" rx="3.5" ry="4.5" fill="#4a3020" style={{ animation: "lu-blink 3s ease-in-out 0.3s infinite" }}/>
            <path d="M158 230 Q170 225 182 230" fill="none" stroke="#8a5530" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M148 207 Q145 199 150 195 Q170 188 190 195 Q195 199 192 207" fill="#c8956a" stroke="#a0754a" strokeWidth="1.5"/>
            <path d="M128 215 L108 240" fill="none" stroke="#c8956a" strokeWidth="12" strokeLinecap="round"/>
            <path d="M212 215 L235 240" fill="none" stroke="#c8956a" strokeWidth="12" strokeLinecap="round"/>
            <path d="M108 240 L95 257" fill="none" stroke="#c8956a" strokeWidth="10" strokeLinecap="round"/>
            <path d="M235 240 L248 257" fill="none" stroke="#c8956a" strokeWidth="10" strokeLinecap="round"/>
            <ellipse cx="93" cy="259" rx="9" ry="6" fill="#b07850"/>
            <ellipse cx="250" cy="259" rx="9" ry="6" fill="#b07850"/>
            <rect x="118" y="215" width="104" height="50" fill="#7C3AED" rx="4"/>
            <rect x="122" y="219" width="96" height="42" fill="#5b2bc2" rx="2"/>
          </g>

          {/* Sweat drops */}
          <circle cx="145" cy="195" r="4" fill="#ef4444" opacity="0.8" style={{ animation: "lu-sweat 2s ease-in-out infinite" }}/>
          <circle cx="135" cy="184" r="2.5" fill="#ef4444" opacity="0.6" style={{ animation: "lu-sweat 2s ease-in-out 0.3s infinite" }}/>
          <circle cx="150" cy="176" r="1.5" fill="#ef4444" opacity="0.4" style={{ animation: "lu-sweat 2s ease-in-out 0.6s infinite" }}/>

          <text x="170" y="344" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11.5" fill="#9A95AC">Dense textbooks. No idea what stuck.</text>

          {/* Desk surface right */}
          <rect x="380" y="268" width="260" height="48" fill="#1a2535" rx="4"/>

          {/* Relaxed person */}
          <g style={{ animation: "lu-bob 3s ease-in-out infinite", transformOrigin: "530px 230px" }}>
            {/* Laptop */}
            <rect x="410" y="225" width="240" height="155" fill="#1a1330" rx="4" stroke="#3a2d5a" strokeWidth="0.5"/>
            <rect x="410" y="225" width="240" height="6" fill="#2e2350" rx="4"/>
            <rect x="416" y="227" width="4" height="2" rx="1" fill="#ef4444" opacity="0.8"/>
            <rect x="424" y="227" width="4" height="2" rx="1" fill="#FFC24B" opacity="0.8"/>
            <rect x="432" y="227" width="4" height="2" rx="1" fill="#3DE0A0" opacity="0.8"/>
            <rect x="414" y="235" width="228" height="138" fill="#0d1a2b" rx="2"/>
            <g style={{ animation: "lu-screen 2s ease-in-out infinite" }}>
              <circle cx="528" cy="285" r="22" fill="none" stroke="#7C3AED" strokeWidth="1" opacity="0.5"/>
              <circle cx="528" cy="285" r="14" fill="none" stroke="#3DE0A0" strokeWidth="0.8" opacity="0.6"/>
              <circle cx="528" cy="285" r="7" fill="#7C3AED" opacity="0.7"/>
              <g style={{ animation: "lu-orbit 2.5s linear infinite", transformOrigin: "528px 285px" }}>
                <circle cx="528" cy="285" r="5" fill="#3DE0A0"/>
              </g>
              <g style={{ animation: "lu-orbit 4s linear infinite reverse", transformOrigin: "528px 285px" }}>
                <circle cx="528" cy="267" r="3.5" fill="#FF5C49"/>
              </g>
            </g>
            <rect x="420" y="348" width="228" height="4" rx="2" fill="#2a2050"/>
            <rect x="420" y="348" width="120" height="4" rx="2" fill="#3DE0A0" opacity="0.6"/>
            <rect x="570" y="346" width="18" height="8" rx="2" fill="#FF5C49" opacity="0.9"/>
            <text x="426" y="244" fontFamily="'JetBrains Mono', monospace" fontSize="8" fill="#3DE0A0" opacity="0.7">LESSON 3 — ELECTROMAGNETIC WAVES</text>

            {/* Person head + body */}
            <ellipse cx="530" cy="218" rx="42" ry="26" fill="#d4956a"/>
            <ellipse cx="514" cy="215" rx="6" ry="6.5" fill="white"/>
            <ellipse cx="546" cy="215" rx="6" ry="6.5" fill="white"/>
            <ellipse cx="515" cy="216" rx="3.5" ry="4" fill="#3d2510" style={{ animation: "lu-blink 4s ease-in-out 0.5s infinite" }}/>
            <ellipse cx="547" cy="216" rx="3.5" ry="4" fill="#3d2510" style={{ animation: "lu-blink 4s ease-in-out 0.8s infinite" }}/>
            <path d="M516 228 Q530 237 544 228" fill="none" stroke="#8a4520" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M522 231 Q530 237 538 231" fill="#d47060"/>
            <path d="M508 207 Q505 199 510 195 Q530 187 550 195 Q555 199 552 207" fill="#d4956a" stroke="#b07845" strokeWidth="1.5"/>
          </g>

          {/* Arms on laptop */}
          <path d="M490 215 L468 237" fill="none" stroke="#d4956a" strokeWidth="12" strokeLinecap="round"/>
          <path d="M570 215 L592 237" fill="none" stroke="#d4956a" strokeWidth="12" strokeLinecap="round"/>
          <path d="M468 237 L458 260" fill="none" stroke="#d4956a" strokeWidth="10" strokeLinecap="round"/>
          <path d="M592 237 L602 260" fill="none" stroke="#d4956a" strokeWidth="10" strokeLinecap="round"/>
          <ellipse cx="456" cy="262" rx="9" ry="6" fill="#b87040"/>
          <ellipse cx="604" cy="262" rx="9" ry="6" fill="#b87040"/>

          {/* Floating UI elements */}
          <g style={{ animation: "lu-float 2s ease-in-out infinite" }}>
            <path d="M556 178 L566 168 L572 175 L576 162 L582 170 L588 160" fill="none" stroke="#3DE0A0" strokeWidth="1.5" strokeLinecap="round"/>
          </g>
          <g style={{ animation: "lu-float 2s ease-in-out 0.4s infinite" }}>
            <circle cx="600" cy="165" r="8" fill="none" stroke="#7C3AED" strokeWidth="1.2"/>
            <circle cx="600" cy="165" r="3" fill="#7C3AED" opacity="0.6"/>
          </g>
          <g style={{ animation: "lu-float 2s ease-in-out 0.8s infinite" }}>
            <rect x="545" y="155" width="8" height="8" rx="2" fill="none" stroke="#FF5C49" strokeWidth="1.2"/>
          </g>

          <text x="530" y="344" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11.5" fill="#F6F1E7" opacity="0.7">Watching, learning, actually getting it.</text>
        </svg>
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
    </>
  );
}
