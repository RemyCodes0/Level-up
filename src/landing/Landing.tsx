"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode, CSSProperties, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getPricingConfig } from "../api/CourseApi";
import {
  ArrowRight, ArrowUp, Paperclip, Sparkles, Film, Mic, Target, Users, Share2, FileText,
  MessageSquare, Check, X, Play, Plus, Zap, BookOpen, GraduationCap, Brain, Clock,
  Layers, Globe2, Menu,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — the same "studio" system as the app
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  ink: "#0A0B10",
  surface: "#11131A",
  iris: "#8B7CFF",
  irisSoft: "#B4A9FF",
  ember: "#FF7A45",
  mint: "#3DDC97",
  amber: "#FFB547",
  rose: "#FF5C6C",
  text: "#ECEDF2",
  mute: "#8A8FA3",
  dim: "#6E7389",
};

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
html { scroll-behavior: smooth; }
html, body { background: ${C.ink}; overflow-x: hidden; }
::selection { background: rgba(139,124,255,.45); color: #fff; }
@keyframes lp-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes lp-rec { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
@keyframes lp-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes lp-wave { 0%,100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }
@keyframes lp-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes lp-pulse-ring { 0% { transform: scale(.8); opacity: .8; } 100% { transform: scale(2.2); opacity: 0; } }
@keyframes lp-caret { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
@keyframes lp-sub { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.lp-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.015em; }
.lp-mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, monospace; }
.lp-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.lp-reveal { opacity: 0; transform: translateY(24px); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1); }
.lp-reveal.lp-in { opacity: 1; transform: none; }
.lp-gradient-text { background: linear-gradient(90deg, #C3BAFF, #8B7CFF 45%, #FF7A45); -webkit-background-clip: text; background-clip: text; color: transparent; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  .lp-reveal { opacity: 1; transform: none; }
}
`;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const EYEBROW = "lp-mono text-[11px] font-semibold uppercase tracking-[0.18em]";

// ─────────────────────────────────────────────────────────────────────────────
// Content (single source of truth — the FAQ schema is generated from FAQS)
// ─────────────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "How long does a course take to generate?",
    a: "Lessons build in parallel, so most are ready in about six minutes and a full course in about ten. Each lesson unlocks the moment it's done — you can start watching while the rest finish.",
  },
  {
    q: "What can I make a course about?",
    a: "Anything you can describe in a sentence, or the material itself: upload a PDF (up to 100 pages) or a PowerPoint — lecture slides, a textbook chapter, your own notes. The course is built around exactly that content.",
  },
  {
    q: "How much does it cost?",
    a: "Every new account starts with 100 free credits — no card, no subscription. Each course spends credits based on the size you pick. Need more? Message us in the Level Up WhatsApp community and we'll top you up.",
  },
  {
    q: "What's actually in a course?",
    a: "One, three or six animated video lessons with synced narration — you choose the depth — plus a timed quiz that scores your readiness and breaks down exactly which topics to review.",
  },
  {
    q: "Can I learn with friends?",
    a: "Yes. Study groups share one course: everyone watches the same lessons, takes the quiz individually, and sees the group's progress. When enough members finish, Level Up adds a remedial lesson on the group's weakest topic.",
  },
  {
    q: "Do people I share a course with need an account?",
    a: "No. Shared links and the community gallery play in any browser — lessons, quiz and all — without signing up.",
  },
];

const TOPICS = [
  "The Krebs cycle", "Fourier transforms", "Supply & demand", "Electromagnetic waves", "Big-O notation",
  "The French Revolution", "Organic reaction mechanisms", "Neural networks", "Plate tectonics",
  "Bayes' theorem", "How vaccines work", "Recursion", "Photosynthesis", "Keynesian economics",
  "Quantum tunneling", "Data structures", "Cell division", "Linear regression",
];

const PROMPTS = [
  "Explain how vaccines train the immune system…",
  "Teach me Fourier transforms visually…",
  "Organic chemistry: SN1 vs SN2 reactions…",
  "How do neural networks actually learn?",
  "The causes of the French Revolution…",
];

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const h = () => setReduce(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return reduce;
}

function useInView<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

// Fades/slides a block in the first time it scrolls into view.
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx("lp-reveal", shown && "lp-in", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// Typewriter placeholder that cycles through example prompts — paused while
// the visitor is typing or the field is focused.
function useTypewriter(lines: string[], active: boolean) {
  const [text, setText] = useState("");
  const state = useRef({ line: 0, char: 0, deleting: false });
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = state.current;
      const full = lines[s.line];
      if (!s.deleting) {
        s.char = Math.min(full.length, s.char + 1);
        setText(full.slice(0, s.char));
        if (s.char === full.length) { s.deleting = true; timer = setTimeout(tick, 1800); return; }
        timer = setTimeout(tick, 38 + Math.random() * 40);
      } else {
        s.char = Math.max(0, s.char - 2);
        setText(full.slice(0, s.char));
        if (s.char === 0) { s.deleting = false; s.line = (s.line + 1) % lines.length; timer = setTimeout(tick, 350); return; }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [active, lines]);
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero background — a light-field of dots that leans toward the pointer.
// Native canvas, pauses off-screen / in hidden tabs, static under reduced motion.
// ─────────────────────────────────────────────────────────────────────────────

function LightField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rect = host.getBoundingClientRect();
    let raf = 0;
    let running = false;
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    const GAP = 30;

    const resize = () => {
      rect = host.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onMove = (e: MouseEvent) => { pointer.tx = e.clientX - rect.left; pointer.ty = e.clientY - rect.top; };
    const onLeave = () => { pointer.tx = -9999; pointer.ty = -9999; };

    const frame = (time: number, animate: boolean) => {
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);
      if (animate) {
        pointer.x += (pointer.tx - pointer.x) * 0.12;
        pointer.y += (pointer.ty - pointer.y) * 0.12;
      }
      for (let x = GAP / 2; x < w; x += GAP) {
        for (let y = GAP / 2; y < h; y += GAP) {
          const dx = x - pointer.x, dy = y - pointer.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const pull = Math.max(0, 1 - d / 260);
          const wave = animate ? 0.5 + 0.5 * Math.sin(time / 1700 + x * 0.012 + y * 0.016) : 0.5;
          // Fade dots toward the bottom and edges so content stays legible.
          const vignette = Math.max(0, 1 - Math.abs(x - w / 2) / (w * 0.62)) * Math.max(0, 1 - y / (h * 1.05));
          const alpha = (0.08 + wave * 0.1) * vignette + pull * 0.75;
          const ox = pull ? (dx / (d || 1)) * -pull * 6 : 0;
          const oy = pull ? (dy / (d || 1)) * -pull * 6 : 0;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, 1 + pull * 1.6, 0, Math.PI * 2);
          ctx.fillStyle = pull > 0.05 ? `rgba(180,169,255,${Math.min(alpha, 0.95)})` : `rgba(236,237,242,${alpha})`;
          ctx.fill();
        }
      }
    };

    const loop = (t: number) => { frame(t, true); raf = requestAnimationFrame(loop); };
    const start = () => {
      if (running || reduce) return;
      running = true;
      window.addEventListener("mousemove", onMove, { passive: true });
      host.addEventListener("mouseleave", onLeave);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
    };

    if (reduce) {
      frame(0, false);
      const r = () => { resize(); frame(0, false); };
      window.addEventListener("resize", r);
      return () => window.removeEventListener("resize", r);
    }

    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.02 });
    io.observe(host);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", resize);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
      stop();
    };
  }, [reduce]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Studio demo — a scripted, looping simulation of a lesson being built and
// played: prompt typed → scenes planned → narration recorded → animation
// rendered → playback. Pure SVG/CSS, no video assets.
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PROMPT = "Explain how vaccines train the immune system";
const DEMO_SCENES = [3, 2, 4, 3, 2, 3, 4, 2]; // relative scene lengths
const DEMO_SUBS = [
  "A vaccine shows your immune system a harmless preview of a pathogen…",
  "…so B cells can learn its shape and build matching antibodies.",
  "Memory cells keep that blueprint on file — sometimes for decades.",
  "When the real virus arrives, the response is fast and overwhelming.",
];
const LOOP_MS = 19000;

function StudioDemo() {
  const [wrapRef, visible] = useInView<HTMLDivElement>(0.2);
  const reduce = useReducedMotion();
  const [t, setT] = useState(reduce ? 14000 : 0);

  useEffect(() => {
    if (reduce) { setT(14000); return; }
    if (!visible) return;
    const start = performance.now() - t;
    let raf = 0;
    const tick = (now: number) => { setT((now - start) % LOOP_MS); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduce]);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const typed = clamp(t / 2600);
  const plan = clamp((t - 2800) / 1800);
  const voice = clamp((t - 4400) / 3600);
  const picture = clamp((t - 6200) / 4400);
  const playing = t >= 11000;
  const play = clamp((t - 11000) / 7600);
  const n = DEMO_SCENES.length;
  const scenesPlanned = Math.round(plan * n);
  const voiceDone = Math.floor(voice * n);
  const picDone = Math.floor(picture * n);
  const pct = Math.round(voice * 50 + picture * 50);
  const sub = DEMO_SUBS[Math.min(DEMO_SUBS.length - 1, Math.floor(play * DEMO_SUBS.length))];
  const stage = playing ? "Playing lesson 01" : picture > 0 ? "Animating scenes" : voice > 0 ? "Recording narration" : plan > 0 ? "Planning scenes" : "Reading your prompt";

  const totalW = DEMO_SCENES.reduce((a, b) => a + b, 0);

  return (
    <div ref={wrapRef} className="relative">
      <div className="pointer-events-none absolute -inset-10 rounded-[48px] opacity-60 blur-3xl" style={{ background: `radial-gradient(50% 50% at 50% 50%, ${C.iris}40, transparent)` }} />
      <div className="relative overflow-hidden rounded-[22px] bg-[#0D0F15] shadow-[0_60px_120px_-40px_rgba(0,0,0,1)] ring-1 ring-white/[0.1]">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5C6C]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FFB547]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#3DDC97]/70" />
          </div>
          <div className="lp-mono mx-auto flex items-center gap-2 truncate rounded-md bg-white/[0.04] px-3 py-1 text-[10px] text-[#8A8FA3] sm:text-[11px]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: playing ? C.mint : C.ember, animation: "lp-rec 1.4s ease-in-out infinite" }} />
            leveluppedu.app/studio
          </div>
          <span className="lp-mono hidden w-14 text-right text-[11px] tabular-nums text-[#8A8FA3] sm:block">{playing ? `${Math.round(play * 100)}%` : `${pct}%`}</span>
        </div>

        {/* Prompt line */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#8B7CFF]/15"><Sparkles className="h-3.5 w-3.5 text-[#B4A9FF]" /></span>
          <p className="min-w-0 flex-1 truncate text-[13px] text-white sm:text-sm">
            {DEMO_PROMPT.slice(0, Math.round(typed * DEMO_PROMPT.length))}
            {typed < 1 && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-[#B4A9FF]" style={{ animation: "lp-caret 1s step-end infinite" }} />}
          </p>
          <span className="hidden shrink-0 rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-medium text-[#B9BCCB] ring-1 ring-white/[0.08] sm:inline">Deeper dive · 3 lessons</span>
        </div>

        {/* Monitor */}
        <div className="relative aspect-video overflow-hidden bg-[#07080C]">
          <div className="lp-grain absolute inset-0 opacity-50" />
          {playing ? (
            <DemoScene progress={play} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E3E5EE] ring-1 ring-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A45]" style={{ animation: "lp-rec 1.4s ease-in-out infinite" }} /> In production
              </span>
              <p className="lp-serif text-2xl text-white sm:text-4xl">{stage}…</p>
              <div className="flex h-6 items-center gap-[3px] opacity-80">
                {Array.from({ length: 22 }).map((_, i) => (
                  <span key={i} className="h-full w-[3px] rounded-full bg-[#B4A9FF]" style={{ animation: "lp-wave 1.1s ease-in-out infinite", animationDelay: `${(i % 7) * 0.09}s` }} />
                ))}
              </div>
            </div>
          )}
          {playing && (
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
              <p key={sub} className="mx-auto w-fit max-w-[90%] rounded-lg bg-black/60 px-3 py-1.5 text-center text-[11px] text-white backdrop-blur sm:text-sm" style={{ animation: "lp-sub .5s ease both" }}>
                {sub}
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="space-y-2.5 border-t border-white/[0.06] px-4 py-4 sm:px-5">
          <TimelineTrack icon={<Layers className="h-3 w-3" />} label="Scenes" sizes={DEMO_SCENES} total={totalW} done={scenesPlanned} color="rgba(255,255,255,0.22)" />
          <TimelineTrack icon={<Mic className="h-3 w-3" />} label="Voice" sizes={DEMO_SCENES} total={totalW} done={voiceDone} color={C.iris} wave />
          <TimelineTrack icon={<Film className="h-3 w-3" />} label="Picture" sizes={DEMO_SCENES} total={totalW} done={picDone} color={C.mint} />
          <div className="relative ml-[68px] h-1 rounded-full bg-white/[0.05] sm:ml-[76px]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/70" style={{ width: `${play * 100}%` }} />
            {playing && <span className="absolute -top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow" style={{ left: `${play * 100}%` }} />}
          </div>
        </div>
      </div>

      {/* Floating callouts */}
      <div className="absolute -left-4 top-24 hidden rounded-2xl bg-[#11131A]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur lg:block" style={{ animation: "lp-float 5s ease-in-out infinite" }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">Narration</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white"><Mic className="h-3.5 w-3.5 text-[#B4A9FF]" /> Synced to every scene</p>
      </div>
      <div className="absolute -right-4 bottom-28 hidden rounded-2xl bg-[#11131A]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur lg:block" style={{ animation: "lp-float 6s ease-in-out .8s infinite" }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">Readiness</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white"><Target className="h-3.5 w-3.5 text-[#3DDC97]" /> Quiz scored by topic</p>
      </div>
    </div>
  );
}

function TimelineTrack({ icon, label, sizes, total, done, color, wave = false }: {
  icon: ReactNode; label: string; sizes: number[]; total: number; done: number; color: string; wave?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-[60px] shrink-0 items-center gap-1.5 text-[10px] text-[#6E7389] sm:w-[68px] sm:text-[11px]">{icon}{label}</span>
      <div className="flex h-4 flex-1 gap-1 sm:h-5">
        {sizes.map((s, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-[4px] transition-colors duration-500"
            style={{ flexGrow: s / total, flexBasis: 0, background: i < done ? (wave ? `${color}40` : color) : "rgba(255,255,255,0.04)" }}
          >
            {wave && i < done && (
              <div className="absolute inset-0 flex items-center justify-center gap-[2px] px-1">
                {Array.from({ length: Math.max(2, s * 2) }).map((_, k) => (
                  <span key={k} className="w-[2px] rounded-full" style={{ height: `${35 + ((k * 41 + i * 17) % 55)}%`, background: C.irisSoft }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// The "rendered lesson": a vaccine → antibody → memory diagram that animates
// through four beats matching the subtitles.
function DemoScene({ progress }: { progress: number }) {
  const beat = Math.min(3, Math.floor(progress * 4));
  const antibodies = beat >= 1 ? 6 : 0;
  return (
    <svg viewBox="0 0 640 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="lp-cell" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor={C.iris} stopOpacity=".55" />
          <stop offset="100%" stopColor={C.iris} stopOpacity=".05" />
        </radialGradient>
        <radialGradient id="lp-virus" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C.ember} stopOpacity=".95" />
          <stop offset="100%" stopColor={C.rose} stopOpacity=".6" />
        </radialGradient>
      </defs>

      <text x="32" y="44" fill={C.dim} fontFamily="Geist Mono, monospace" fontSize="11" letterSpacing="2">LESSON 01 · HOW VACCINES WORK</text>
      <text x="32" y="78" fill="#fff" fontFamily="Instrument Serif, serif" fontSize="30">
        {["Meet the preview", "Learning the shape", "Keeping the blueprint", "The real thing arrives"][beat]}
      </text>

      {/* Immune cell */}
      <g transform="translate(320 205)">
        <circle r="78" fill="url(#lp-cell)" />
        <circle r="78" fill="none" stroke={C.iris} strokeOpacity=".5" strokeDasharray="4 6">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="24s" repeatCount="indefinite" />
        </circle>
        <circle r="26" fill={C.iris} fillOpacity=".35" stroke={C.irisSoft} strokeOpacity=".6" />

        {/* Antibodies orbiting */}
        <g style={{ transformOrigin: "0 0", animation: "lp-orbit 9s linear infinite" }}>
          {Array.from({ length: antibodies }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            const x = Math.cos(a) * 112, y = Math.sin(a) * 112;
            const deg = (a * 180) / Math.PI + 90;
            return (
              <g key={i} transform={`translate(${x} ${y}) rotate(${deg})`} opacity={beat >= 1 ? 1 : 0} style={{ transition: "opacity .6s" }}>
                <path d="M0 10 L0 -2 M0 -2 L-7 -11 M0 -2 L7 -11" stroke={C.mint} strokeWidth="3" strokeLinecap="round" fill="none" />
              </g>
            );
          })}
        </g>
      </g>

      {/* Memory blueprint card */}
      <g transform="translate(470 120)" opacity={beat >= 2 ? 1 : 0} style={{ transition: "opacity .7s" }}>
        <rect width="130" height="74" rx="10" fill="#11131A" stroke="rgba(255,255,255,.12)" />
        <text x="12" y="22" fill={C.dim} fontFamily="Geist Mono, monospace" fontSize="9" letterSpacing="1.5">MEMORY CELL</text>
        <rect x="12" y="34" width="70" height="6" rx="3" fill={C.mint} fillOpacity=".7" />
        <rect x="12" y="46" width="100" height="6" rx="3" fill="rgba(255,255,255,.15)" />
        <rect x="12" y="58" width="56" height="6" rx="3" fill="rgba(255,255,255,.15)" />
      </g>

      {/* Virus: preview (beat 0) → many real ones (beat 3) */}
      {(beat === 0 ? [[120, 205]] : beat === 3 ? [[110, 160], [96, 250], [160, 300], [540, 290], [560, 220]] : [[120, 205]]).map(([x, y], i) => (
        <g key={`${beat}-${i}`} transform={`translate(${x} ${y})`} opacity={beat === 1 || beat === 2 ? 0.35 : 1}>
          <circle r={beat === 0 ? 22 : 14} fill="url(#lp-virus)" />
          {Array.from({ length: 8 }).map((_, k) => {
            const a = (k / 8) * Math.PI * 2;
            const r = beat === 0 ? 22 : 14;
            return <line key={k} x1={Math.cos(a) * r} y1={Math.sin(a) * r} x2={Math.cos(a) * (r + 7)} y2={Math.sin(a) * (r + 7)} stroke={C.ember} strokeWidth="2.5" strokeLinecap="round" />;
          })}
          {beat === 3 && <circle r="22" fill="none" stroke={C.mint} strokeWidth="1.5" style={{ transformOrigin: "0 0", animation: "lp-pulse-ring 1.4s ease-out infinite" }} />}
        </g>
      ))}
      {beat === 0 && (
        <text x="120" y="258" textAnchor="middle" fill={C.mute} fontFamily="Geist, sans-serif" fontSize="12">harmless preview</text>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

function SectionHead({ eyebrow, title, sub, center = false, color = C.irisSoft }: { eyebrow: string; title: ReactNode; sub?: string; center?: boolean; color?: string }) {
  return (
    <Reveal className={cx("mb-12 sm:mb-14", center && "text-center")}>
      <p className={EYEBROW} style={{ color }}>{eyebrow}</p>
      <h2 className={cx("lp-serif mt-4 text-[40px] leading-[1.02] text-white sm:text-[58px]", center ? "mx-auto max-w-3xl" : "max-w-3xl")}>{title}</h2>
      {sub && <p className={cx("mt-4 text-[15px] leading-relaxed text-[#8A8FA3] sm:text-base", center ? "mx-auto max-w-xl" : "max-w-xl")}>{sub}</p>}
    </Reveal>
  );
}

function PromptBar({ value, onChange, onSubmit, onUpload, big = false, autoTypewriter = true }: {
  value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void; onUpload: () => void; big?: boolean; autoTypewriter?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const typed = useTypewriter(PROMPTS, autoTypewriter && !focused && !value);
  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="rounded-[22px] bg-gradient-to-b from-white/[0.18] to-white/[0.04] p-px transition-all focus-within:from-[#8B7CFF]/80 focus-within:to-[#FF7A45]/30">
        <div className={cx("flex items-center gap-2 rounded-[21px] bg-[#101218]/95 backdrop-blur-xl", big ? "p-2 sm:p-2.5" : "p-1.5 sm:p-2")}>
          <button
            type="button"
            onClick={onUpload}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] text-[#B9BCCB] transition-colors hover:bg-white/[0.06] hover:text-white"
            title="Upload your notes"
            aria-label="Upload your notes"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="What do you want to learn?"
              placeholder={focused ? "What do you want to learn?" : ""}
              className={cx("w-full bg-transparent text-white outline-none placeholder:text-[#555A6E]", big ? "py-3 text-base sm:text-[17px]" : "py-2.5 text-[15px]")}
            />
            {!value && !focused && (
              <span className={cx("pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-[#555A6E]", big ? "text-base sm:text-[17px]" : "text-[15px]")}>
                {typed || "What do you want to learn?"}
                <span className="ml-0.5 inline-block h-5 w-[2px] bg-[#8B7CFF]/70" style={{ animation: "lp-caret 1s step-end infinite" }} />
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label="Generate this course"
            className={cx(
              "flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold transition-all",
              big ? "h-12 px-4 sm:px-5" : "h-10 px-3.5",
              value.trim()
                ? "bg-[#8B7CFF] text-[#0A0B10] shadow-[0_10px_30px_-8px_rgba(139,124,255,0.9)] hover:bg-[#A093FF]"
                : "bg-white/[0.06] text-[#555A6E]"
            )}
          >
            <span className="hidden text-sm sm:inline">Generate</span>
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </form>
  );
}

function FaqItem({ q, a, open, onToggle, index }: { q: string; a: string; open: boolean; onToggle: () => void; index: number }) {
  return (
    <div className="border-b border-white/[0.07]">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-5 py-6 text-left">
        <span className="lp-mono w-6 shrink-0 text-xs text-[#555A6E]">{String(index + 1).padStart(2, "0")}</span>
        <span className={cx("flex-1 text-[15px] font-medium transition-colors sm:text-lg", open ? "text-white" : "text-[#D6D8E2]")}>{q}</span>
        <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 transition-all duration-300", open ? "rotate-45 bg-[#8B7CFF] text-[#0A0B10] ring-[#8B7CFF]" : "text-[#8A8FA3] ring-white/[0.12]")}>
          <Plus className="h-4 w-4" />
        </span>
      </button>
      <div className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <p className="pb-6 pl-11 pr-12 text-sm leading-relaxed text-[#8A8FA3] sm:text-[15px]">{a}</p>
        </div>
      </div>
    </div>
  );
}

function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="relative shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const [heroPrompt, setHeroPrompt] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroIn, setHeroIn] = useState(false);
  const [freeMode, setFreeMode] = useState<{ enabled: boolean; dailyLessonLimit: number } | null>(null);
  const isFree = !!freeMode?.enabled;

  useEffect(() => {
    getPricingConfig().then((cfg) => setFreeMode(cfg.freeMode ?? null)).catch((err) => console.error("Failed to load pricing config:", err));
  }, []);

  useEffect(() => { const id = requestAnimationFrame(() => setHeroIn(true)); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const loggedIn = () => !!localStorage.getItem("token");

  // Sends the visitor straight to generating THIS topic: the prompt waits
  // pre-filled and focused in the app's composer (see AILearningPage's
  // "levelup_pending_prompt" pickup), via /signup for logged-out visitors.
  const startWith = (value: string) => {
    const v = value.trim();
    if (!v) return;
    localStorage.setItem("levelup_pending_prompt", v);
    navigate(loggedIn() ? "/ai_tutor" : "/signup");
  };
  const goApp = () => navigate(loggedIn() ? "/ai_tutor" : "/signup");
  const onHeroSubmit = (e: FormEvent) => { e.preventDefault(); startWith(heroPrompt); };
  const onFinalSubmit = (e: FormEvent) => { e.preventDefault(); startWith(finalPrompt); };

  const navLinks = [
    { href: "#how", label: "How it works" },
    { href: "#inside", label: "Inside a course" },
    { href: "#groups", label: "Study groups" },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <>
      <Helmet>
        <title>Level Up AI — Turn Any Topic Into Animated Video Lessons</title>
        <meta name="description" content="Type a topic or upload your notes. Level Up AI builds animated, narrated video lessons and a readiness quiz in minutes. 100 free credits, no card needed." />
        <meta name="keywords" content="AI learning, animated video lessons, AI course generator, study tool, personalized learning, AI tutor, educational AI, learn visually, PDF to course" />
        <meta name="author" content="Level Up AI" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://leveluppedu.app" />
        <meta name="theme-color" content={C.ink} />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Level Up AI" />
        <meta property="og:title" content="Level Up AI — Turn Any Topic Into Animated Video Lessons" />
        <meta property="og:description" content="Type a topic or upload your PDF. Get animated, narrated lessons and a quiz that scores your readiness — in minutes. 100 free credits to start." />
        <meta property="og:url" content="https://leveluppedu.app" />
        <meta property="og:image" content="https://leveluppedu.app/logo.png" />
        <meta property="og:image:alt" content="Level Up AI logo" />
        <meta property="og:locale" content="en_US" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@levelupai" />
        <meta name="twitter:title" content="Level Up AI — Turn Any Topic Into Animated Video Lessons" />
        <meta name="twitter:description" content="Type a topic or upload your PDF. Get animated, narrated lessons and a readiness quiz in minutes." />
        <meta name="twitter:image" content="https://leveluppedu.app/logo.png" />
        <meta name="twitter:image:alt" content="Level Up AI logo" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />

        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Level Up AI",
          url: "https://leveluppedu.app",
          description: "AI-powered platform that generates animated, narrated video courses from any topic or PDF, with a readiness quiz.",
          applicationCategory: "EducationApplication",
          operatingSystem: "Web",
          publisher: { "@type": "Organization", name: "Level Up AI", url: "https://leveluppedu.app", logo: { "@type": "ImageObject", url: "https://leveluppedu.app/logo.png" } },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Level Up AI",
          url: "https://leveluppedu.app",
          logo: "https://leveluppedu.app/logo.png",
          description: "Level Up AI turns any topic or PDF into animated, narrated video courses with a readiness quiz.",
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        })}</script>
      </Helmet>

      <div
        className="relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased"
        style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
      >
        <style>{PAGE_CSS}</style>

        {/* ── Nav ── */}
        <nav className={cx("fixed inset-x-0 top-0 z-50 transition-all duration-300", scrolled ? "border-b border-white/[0.06] bg-[#0A0B10]/75 backdrop-blur-xl" : "border-b border-transparent")}>
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <a href="#top" className="flex shrink-0 items-center gap-2.5">
              <Logo />
              <span className="lp-serif text-[22px] text-white">Level Up</span>
            </a>
            <div className="hidden items-center gap-1 md:flex">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-[13px] text-[#8A8FA3] transition-colors hover:text-white">{l.label}</a>
              ))}
              <Link to="/gallery" className="rounded-lg px-3 py-2 text-[13px] text-[#8A8FA3] transition-colors hover:text-white">Gallery</Link>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => navigate(loggedIn() ? "/ai_tutor" : "/login")} className="hidden h-9 rounded-xl px-3.5 text-[13px] font-medium text-[#B9BCCB] transition-colors hover:text-white sm:block">Log in</button>
              <button onClick={goApp} className="h-9 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#0A0B10] transition-all hover:bg-[#E3E0FF]">
                Start free
              </button>
              <button onClick={() => setMenuOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#B9BCCB] hover:bg-white/[0.06] md:hidden" aria-label="Menu" aria-expanded={menuOpen}>
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {menuOpen && (
            <div className="border-t border-white/[0.06] bg-[#0A0B10]/95 px-4 py-3 backdrop-blur-xl md:hidden">
              {[
                ...navLinks,
                { href: "/gallery", label: "Gallery" },
                loggedIn() ? { href: "/ai_tutor", label: "Open app" } : { href: "/login", label: "Log in" },
              ].map((l) => (
                <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-3 text-[15px] text-[#D6D8E2] hover:bg-white/[0.04]">{l.label}</a>
              ))}
            </div>
          )}
        </nav>

        {/* ── Hero ── */}
        <header id="top" className="relative overflow-hidden pt-16">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -top-60 left-1/2 h-[640px] w-[980px] -translate-x-1/2 rounded-full opacity-35 blur-[120px]" style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }} />
            <div className="absolute right-[-200px] top-40 h-[420px] w-[560px] rounded-full opacity-[0.18] blur-[120px]" style={{ background: `radial-gradient(closest-side, ${C.ember}, transparent)` }} />
          </div>
          <div className="absolute inset-x-0 top-0 h-[760px]"><LightField /></div>
          <div className="pointer-events-none absolute inset-x-0 top-[560px] h-[300px] bg-gradient-to-b from-transparent to-[#0A0B10]" />

          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
            <div
              className="mx-auto max-w-3xl text-center transition-all duration-1000"
              style={{ opacity: heroIn ? 1 : 0, transform: heroIn ? "none" : "translateY(18px)" }}
            >
              <a href="#inside" className="group inline-flex items-center gap-2.5 rounded-full bg-white/[0.04] py-1.5 pl-1.5 pr-3.5 text-[12px] text-[#B9BCCB] ring-1 ring-white/[0.1] backdrop-blur transition-colors hover:bg-white/[0.07]">
                <span className="flex items-center gap-1.5 rounded-full bg-[#FF7A45]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#FFB08A]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A45]" style={{ animation: "lp-rec 1.4s ease-in-out infinite" }} /> Rec
                </span>
                {isFree ? "Free for everyone right now" : "100 free credits — no card needed"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>

              <h1 className="lp-serif mt-8 text-[52px] leading-[0.98] text-white sm:text-[84px] lg:text-[96px]">
                Stop Cramming,<br />
                Learn <span className="lp-gradient-text italic">Visually.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-[#8A8FA3] sm:text-lg">
                Tell Level Up what you're studying. It writes, narrates and animates a full video course — then quizzes you until you're ready.
              </p>

              <div className="mx-auto mt-10 max-w-2xl">
                <PromptBar value={heroPrompt} onChange={setHeroPrompt} onSubmit={onHeroSubmit} onUpload={goApp} big />
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[#6E7389]">
                  <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#3DDC97]" /> Topic, PDF or slides</span>
                  <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#3DDC97]" /> Ready in minutes</span>
                  <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#3DDC97]" /> We'll take you straight there</span>
                </div>
              </div>
            </div>

            <Reveal className="mx-auto mt-20 max-w-4xl sm:mt-24" delay={150}>
              <StudioDemo />
            </Reveal>
          </div>
        </header>

        {/* ── Topic marquee ── */}
        <section aria-label="Example topics" className="relative border-y border-white/[0.06] py-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#0A0B10] to-transparent sm:w-40" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#0A0B10] to-transparent sm:w-40" />
          <div className="flex overflow-hidden">
            <div className="flex shrink-0 items-center gap-3 pr-3" style={{ animation: "lp-marquee 60s linear infinite" }}>
              {[...TOPICS, ...TOPICS].map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setHeroPrompt(`Teach me ${t}`); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="lp-serif shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xl italic text-[#6E7389] ring-1 ring-white/[0.06] transition-colors hover:text-white hover:ring-white/[0.2]"
                  tabIndex={i >= TOPICS.length ? -1 : 0}
                  aria-hidden={i >= TOPICS.length}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32">
          <SectionHead eyebrow="How it works" title={<>From a sentence to a <span className="italic text-[#B4A9FF]">finished course</span>.</>} />
          <div className="relative grid gap-5 md:grid-cols-3">
            <div className="pointer-events-none absolute left-0 right-0 top-[54px] hidden h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent md:block" />
            {[
              { n: "01", icon: FileText, title: "Describe it — or drop in your notes", body: "A sentence, lecture slides, a textbook chapter. A quick chat checks your level so lessons land at the right depth.", color: C.iris },
              { n: "02", icon: Film, title: "Watch it come to life", body: "Scenes are planned, narrated and animated in parallel. Each lesson unlocks the moment it's done.", color: C.ember },
              { n: "03", icon: Target, title: "Prove you've got it", body: "A timed quiz scores your readiness, topic by topic, and tells you exactly what to review.", color: C.mint },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div className="group relative h-full rounded-3xl bg-[#11131A] p-6 ring-1 ring-white/[0.07] transition-all duration-500 hover:-translate-y-1 hover:ring-white/[0.16] sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl ring-1" style={{ background: `${s.color}14`, boxShadow: `inset 0 0 0 1px ${s.color}40` }}>
                      <s.icon className="h-5 w-5" style={{ color: s.color }} />
                    </span>
                    <span className="lp-mono text-sm text-[#3E4253]">{s.n}</span>
                  </div>
                  <h3 className="lp-serif mt-6 text-[28px] leading-[1.1] text-white">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#8A8FA3]">{s.body}</p>
                  <span className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-40" style={{ background: s.color }} />
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Inside a course (bento) ── */}
        <section id="inside" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6 sm:pb-32">
          <SectionHead
            eyebrow="Inside a course"
            title={<>Not slides with a voiceover. <span className="italic lp-gradient-text">Real animation.</span></>}
            sub="Every lesson is written, scored and animated for your topic — then wrapped in the tools that make it stick."
          />
          <div className="grid gap-4 md:grid-cols-6">
            {/* Animated lessons — large */}
            <Reveal className="md:col-span-4">
              <div className="relative h-full min-h-[300px] overflow-hidden rounded-3xl bg-[#11131A] p-6 ring-1 ring-white/[0.07] sm:p-8">
                <div className="relative z-10 max-w-xs">
                  <Film className="h-5 w-5 text-[#B4A9FF]" />
                  <h3 className="lp-serif mt-4 text-3xl text-white">Animated lessons</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">Diagrams that move, equations that build themselves, processes you can actually see happen.</p>
                </div>
                <svg viewBox="0 0 400 260" className="absolute -bottom-6 -right-6 h-[260px] w-[400px] opacity-90" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <circle key={i} cx="250" cy="150" r={30 + i * 26} fill="none" stroke={i % 2 ? C.iris : C.mint} strokeOpacity={0.5 - i * 0.08} strokeDasharray="3 7">
                      <animateTransform attributeName="transform" type="rotate" from={`0 250 150`} to={`${i % 2 ? -360 : 360} 250 150`} dur={`${18 + i * 6}s`} repeatCount="indefinite" />
                    </circle>
                  ))}
                  <circle cx="250" cy="150" r="18" fill={C.iris} fillOpacity=".6" />
                  <g style={{ transformOrigin: "250px 150px", animation: "lp-orbit 6s linear infinite" }}><circle cx="306" cy="150" r="7" fill={C.mint} /></g>
                  <g style={{ transformOrigin: "250px 150px", animation: "lp-orbit 10s linear infinite reverse" }}><circle cx="250" cy="68" r="5" fill={C.ember} /></g>
                </svg>
              </div>
            </Reveal>

            {/* Narration */}
            <Reveal className="md:col-span-2" delay={100}>
              <div className="relative flex h-full min-h-[300px] flex-col overflow-hidden rounded-3xl bg-[#11131A] p-6 ring-1 ring-white/[0.07] sm:p-7">
                <Mic className="h-5 w-5 text-[#B4A9FF]" />
                <h3 className="lp-serif mt-4 text-3xl text-white">Synced narration</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">A clear voice walks you through every scene, timed to the animation.</p>
                <div className="mt-auto flex h-16 items-center gap-[3px] pt-6">
                  {Array.from({ length: 34 }).map((_, i) => (
                    <span key={i} className="h-full flex-1 rounded-full bg-gradient-to-t from-[#8B7CFF] to-[#C3BAFF]" style={{ animation: "lp-wave 1.3s ease-in-out infinite", animationDelay: `${(i % 11) * 0.08}s` }} />
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Quiz */}
            <Reveal className="md:col-span-2" delay={50}>
              <div className="relative h-full min-h-[260px] overflow-hidden rounded-3xl bg-[#11131A] p-6 ring-1 ring-white/[0.07] sm:p-7">
                <Target className="h-5 w-5 text-[#3DDC97]" />
                <h3 className="lp-serif mt-4 text-3xl text-white">Readiness quiz</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">Timed, graded, broken down by topic — with every miss explained.</p>
                <div className="mt-6 space-y-2.5">
                  {[["Antigens", 92, C.mint], ["B cells", 78, C.mint], ["Memory cells", 54, C.rose]].map(([t, p, c]) => (
                    <div key={t as string}>
                      <div className="mb-1 flex justify-between text-[11px]"><span className="text-[#B9BCCB]">{t}</span><span className="lp-mono" style={{ color: c as string }}>{p}%</span></div>
                      <div className="h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${p}%`, background: c as string }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Level check */}
            <Reveal className="md:col-span-2" delay={120}>
              <div className="relative h-full min-h-[260px] overflow-hidden rounded-3xl bg-[#11131A] p-6 ring-1 ring-white/[0.07] sm:p-7">
                <Brain className="h-5 w-5 text-[#FFB547]" />
                <h3 className="lp-serif mt-4 text-3xl text-white">Pitched at your level</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">A 30-second chat calibrates depth — beginner, intermediate or advanced.</p>
                <div className="mt-5 space-y-2 text-[12px]">
                  <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-white/[0.05] px-3 py-2 text-[#D6D8E2]">Have you met B cells before?</p>
                  <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-[#8B7CFF] px-3 py-2 font-medium text-[#0A0B10]">A little, in high school</p>
                </div>
              </div>
            </Reveal>

            {/* PDF */}
            <Reveal className="md:col-span-2" delay={190}>
              <div className="relative h-full min-h-[260px] overflow-hidden rounded-3xl bg-[#11131A] p-6 ring-1 ring-white/[0.07] sm:p-7">
                <FileText className="h-5 w-5 text-[#FF7A45]" />
                <h3 className="lp-serif mt-4 text-3xl text-white">Your material</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">Upload a PDF (up to 100 pages) or a PowerPoint — the course follows it.</p>
                <div className="relative mt-6 h-20">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="absolute left-0 top-0 h-20 w-16 rounded-lg bg-white/[0.06] ring-1 ring-white/[0.1]" style={{ transform: `translateX(${i * 22}px) rotate(${-6 + i * 6}deg)`, zIndex: 3 - i }}>
                      <div className="m-2 space-y-1.5">{[70, 90, 50, 80].map((w, k) => <div key={k} className="h-1 rounded bg-white/20" style={{ width: `${w}%` }} />)}</div>
                    </div>
                  ))}
                  <ArrowRight className="absolute left-[110px] top-7 h-5 w-5 text-[#6E7389]" />
                  <div className="absolute left-[146px] top-2 flex h-16 w-24 items-center justify-center rounded-lg bg-gradient-to-br from-[#8B7CFF]/40 to-[#FF7A45]/30 ring-1 ring-white/10">
                    <Play className="h-5 w-5 fill-white text-white" />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Course sizes ── */}
        <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
          <SectionHead
            eyebrow="Pick your depth"
            title={<>A quick explainer or <span className="italic text-[#B4A9FF]">full mastery</span>.</>}
            sub={isFree ? "Choose the size of each course. They're all free right now." : "Choose the size of each course. Bigger courses spend more credits — and your first 100 are on us."}
          />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { name: "Quick Explainer", lessons: 1, icon: Zap, desc: "One focused lesson. Perfect for a single concept the night before.", tone: C.amber },
              { name: "Deeper Dive", lessons: 3, icon: BookOpen, desc: "Three lessons that build on each other, plus a solid quiz.", tone: C.iris, featured: true },
              { name: "Full Mastery", lessons: 6, icon: GraduationCap, desc: "Six lessons and the longest quiz — a full course on the topic.", tone: C.mint },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 110}>
                <div
                  className={cx(
                    "relative flex h-full flex-col overflow-hidden rounded-3xl p-6 transition-all duration-500 hover:-translate-y-1 sm:p-7",
                    t.featured ? "bg-gradient-to-b from-[#8B7CFF]/[0.16] to-[#11131A] ring-2 ring-[#8B7CFF]/70" : "bg-[#11131A] ring-1 ring-white/[0.07] hover:ring-white/[0.16]"
                  )}
                >
                  {t.featured && <span className="absolute right-5 top-5 rounded-full bg-gradient-to-r from-[#8B7CFF] to-[#FF7A45] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0A0B10]">Most picked</span>}
                  <t.icon className="h-5 w-5" style={{ color: t.tone }} />
                  <h3 className="lp-serif mt-5 text-3xl text-white">{t.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#8A8FA3]">{t.desc}</p>
                  <div className="mt-7 flex gap-1.5">
                    {Array.from({ length: 6 }).map((_, k) => (
                      <span key={k} className="h-10 flex-1 rounded-md transition-colors" style={{ background: k < t.lessons ? `${t.tone}${t.featured ? "cc" : "99"}` : "rgba(255,255,255,0.05)" }} />
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-[#B9BCCB]">
                    <span className="text-lg font-semibold text-white">{t.lessons}</span> lesson{t.lessons > 1 ? "s" : ""} + quiz
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Old way vs Level Up ── */}
        <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
          <SectionHead eyebrow="Why it's different" title={<>Most studying is reading.<br className="hidden sm:block" /> <span className="italic text-[#B4A9FF]">This is watching.</span></>} />
          <Reveal>
            <div className="grid overflow-hidden rounded-3xl ring-1 ring-white/[0.07] md:grid-cols-2">
              <div className="bg-[#0D0E13] p-6 sm:p-9">
                <p className={EYEBROW} style={{ color: C.dim }}>The old way</p>
                <ul className="mt-6 space-y-4">
                  {["Rereading dense pages and hoping something sticks", "Hunting for a video that matches your syllabus", "No idea what you actually know until the exam", "Studying alone, guessing what others find hard"].map((t) => (
                    <li key={t} className="flex gap-3 text-[15px] text-[#6E7389]">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.04]"><X className="h-3 w-3" /></span>
                      <span className="line-through decoration-white/10">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative bg-[#11131A] p-6 sm:p-9">
                <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#8B7CFF]/20 blur-3xl" />
                <p className={EYEBROW} style={{ color: C.mint }}>With Level Up</p>
                <ul className="relative mt-6 space-y-4">
                  {["Watch the idea move — animated and narrated", "A course built from your exact topic or notes", "A readiness score that shows what to review", "Study groups that see each other's progress"].map((t) => (
                    <li key={t} className="flex gap-3 text-[15px] text-white">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3DDC97]/15"><Check className="h-3 w-3 text-[#3DDC97]" strokeWidth={3} /></span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Study groups + sharing ── */}
        <section id="groups" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6 sm:pb-32">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionHead
                eyebrow="Study groups & sharing"
                color={C.mint}
                title={<>Better <span className="italic text-[#7BE8B8]">together</span>.</>}
                sub="Make one course for the whole group. Everyone watches, quizzes on their own, and sees how the group is doing — then Level Up adds a lesson on whatever the group found hardest."
              />
              <Reveal delay={100}>
                <div className="-mt-4 flex flex-wrap gap-2.5">
                  {[
                    { icon: Users, t: "Invite with a code" },
                    { icon: Sparkles, t: "Auto remedial lesson" },
                    { icon: Share2, t: "Share any course by link" },
                    { icon: Globe2, t: "Publish to the gallery" },
                  ].map(({ icon: I, t }) => (
                    <span key={t} className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3.5 py-2 text-[13px] text-[#D6D8E2] ring-1 ring-white/[0.08]">
                      <I className="h-3.5 w-3.5 text-[#7BE8B8]" /> {t}
                    </span>
                  ))}
                </div>
                <Link to="/gallery" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white underline-offset-4 hover:underline">
                  Watch real courses in the gallery — no account needed <ArrowRight className="h-4 w-4" />
                </Link>
              </Reveal>
            </div>

            <Reveal delay={150}>
              <div className="relative overflow-hidden rounded-3xl bg-[#11131A] p-5 ring-1 ring-white/[0.08] sm:p-7">
                <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-[#3DDC97]/15 blur-3xl" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-[#6E7389]">Study group</p>
                    <p className="lp-serif text-2xl text-white">Bio 101 — Immunology</p>
                  </div>
                  <span className="lp-mono rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs tracking-[0.2em] text-white ring-1 ring-white/[0.08]">K7Q2M9XA</span>
                </div>
                <div className="relative mt-6 space-y-3">
                  {[
                    { n: "Lina", w: 100, q: 91, c: C.iris },
                    { n: "Omar", w: 83, q: 76, c: C.mint },
                    { n: "Sara", w: 66, q: null, c: C.ember },
                    { n: "Jad", w: 33, q: null, c: C.amber },
                  ].map((m) => (
                    <div key={m.n} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ background: `${m.c}26`, color: m.c }}>{m.n[0]}</span>
                      <div className="flex-1">
                        <div className="mb-1 flex justify-between text-[11px]"><span className="text-[#D6D8E2]">{m.n}</span><span className="lp-mono text-[#6E7389]">{m.w}%</span></div>
                        <div className="h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#5CE1FF]" style={{ width: `${m.w}%` }} /></div>
                      </div>
                      <span className="lp-mono w-10 text-right text-xs" style={{ color: m.q ? C.mint : "#3E4253" }}>{m.q ? `${m.q}%` : "—"}</span>
                    </div>
                  ))}
                </div>
                <div className="relative mt-6 flex items-start gap-3 rounded-2xl bg-[#FFB547]/[0.07] p-3.5 ring-1 ring-[#FFB547]/20">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB547]" />
                  <p className="text-xs leading-relaxed text-[#E8C890]">Remedial lesson added: <span className="font-semibold text-white">“Memory cells, revisited”</span> — the group's weakest topic.</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="relative mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 sm:px-6 sm:pb-32">
          <SectionHead eyebrow="Questions" title="Everything you might be wondering." center />
          <Reveal>
            <div className="border-t border-white/[0.07]">
              {FAQS.map((f) => (isFree && f.q === "How much does it cost?"
                ? { ...f, a: `Nothing right now. Level Up is free for everyone, with up to ${freeMode?.dailyLessonLimit} lessons every 24 hours. No card needed.` }
                : f
              )).map((f, i) => (
                <FaqItem key={f.q} q={f.q} a={f.a} index={i} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-[#6E7389]">
              Still curious? <a href="https://chat.whatsapp.com/CyuV45KQ9Au3awigE39jBC" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-white underline-offset-4 hover:underline"><MessageSquare className="h-3.5 w-3.5" /> Ask us on WhatsApp</a>
            </p>
          </Reveal>
        </section>

        {/* ── Final CTA ── */}
        <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] px-6 py-16 text-center ring-1 ring-white/[0.08] sm:px-12 sm:py-24">
              <div className="absolute inset-0 bg-[#0D0F15]" />
              <div className="absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full opacity-40 blur-[110px]" style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }} />
              <div className="absolute -bottom-40 right-0 h-[360px] w-[520px] rounded-full opacity-25 blur-[110px]" style={{ background: `radial-gradient(closest-side, ${C.ember}, transparent)` }} />
              <div className="lp-grain absolute inset-0 opacity-60" />
              <div className="relative mx-auto max-w-2xl">
                <p className={EYEBROW} style={{ color: C.irisSoft }}>Your first course</p>
                <h2 className="lp-serif mt-5 text-[44px] leading-[1.02] text-white sm:text-[72px]">One topic away.</h2>
                <p className="mx-auto mt-4 max-w-md text-[15px] text-[#8A8FA3]">Type what you want to learn and watch it become a course. {isFree ? "Free right now, no card needed." : "100 free credits, no card needed."}</p>
                <div className="mx-auto mt-9 max-w-xl text-left">
                  <PromptBar value={finalPrompt} onChange={setFinalPrompt} onSubmit={onFinalSubmit} onUpload={goApp} />
                </div>
                <button onClick={() => navigate("/signup")} className="mt-6 inline-flex items-center gap-1.5 text-sm text-[#B9BCCB] transition-colors hover:text-white">
                  or create an account first <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-white/[0.06]">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <Logo size={26} />
                <span className="lp-serif text-xl text-white">Level Up</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#6E7389]">Animated, narrated courses on anything you want to learn.</p>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:grid-cols-3">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#555A6E]">Product</p>
                <Link to="/ai_tutor" className="block text-[#8A8FA3] hover:text-white">Create a course</Link>
                <Link to="/gallery" className="block text-[#8A8FA3] hover:text-white">Gallery</Link>
                <Link to="/collab" className="block text-[#8A8FA3] hover:text-white">Study groups</Link>
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#555A6E]">Account</p>
                <Link to="/login" className="block text-[#8A8FA3] hover:text-white">Log in</Link>
                <Link to="/signup" className="block text-[#8A8FA3] hover:text-white">Sign up</Link>
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#555A6E]">Legal</p>
                <a href="/terms.html" className="block text-[#8A8FA3] hover:text-white">Terms</a>
                <a href="/privacy-policy.html" className="block text-[#8A8FA3] hover:text-white">Privacy</a>
                <a href="/refund-policy.html" className="block text-[#8A8FA3] hover:text-white">Refunds</a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.04]">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 text-xs text-[#555A6E] sm:px-6">
              <span>© {new Date().getFullYear()} Level Up AI</span>
              <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Courses in minutes, not semesters.</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}