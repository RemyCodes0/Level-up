import { useState, useEffect, useRef } from "react";
import { Play, ArrowRight, Sparkles, BookOpen, BarChart3, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const topics = [
  "Quantum Entanglement",
  "Linear Algebra",
  "The French Revolution",
  "Machine Learning",
  "Cell Division",
  "Byzantine Architecture",
  "Neural Networks",
  "Organic Chemistry",
];

function TypewriterInput() {
  const [displayText, setDisplayText] = useState("");
  const [topicIndex, setTopicIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  

  useEffect(() => {
    const currentTopic = topics[topicIndex];

    if (isPaused) {
      timeoutRef.current = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, 2000);
      return;
    }

    if (isDeleting) {
      if (displayText.length === 0) {
        setIsDeleting(false);
        setTopicIndex((i) => (i + 1) % topics.length);
        return;
      }
      timeoutRef.current = setTimeout(() => {
        setDisplayText((t) => t.slice(0, -1));
      }, 40);
    } else {
      if (displayText.length === currentTopic.length) {
        setIsPaused(true);
        return;
      }
      timeoutRef.current = setTimeout(() => {
        setDisplayText(currentTopic.slice(0, displayText.length + 1));
      }, 65);
    }

    return () => clearTimeout(timeoutRef.current);
  }, [displayText, topicIndex, isDeleting, isPaused]);

  return (
    <div className="glass-card rounded-xl p-1 flex items-center gap-2 max-w-[560px] w-full">
      <div className="flex items-center gap-3 flex-1 px-4 py-3">
        <Sparkles className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" />
        <span className="text-[hsl(var(--text-default))] text-base font-medium min-w-0">
          {displayText || " "}
          <span className="inline-block w-0.5 h-4 bg-[#8B5CF6] ml-0.5 align-middle animate-[typewriterBlink_1s_ease-in-out_infinite]" />
        </span>
      </div>
      <button className="gradient-bg text-white text-sm font-semibold px-5 py-3 rounded-lg flex items-center gap-2 flex-shrink-0 hover:-translate-y-0.5 transition-transform duration-150 glow-violet">
        Generate
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function HeroCard() {
    const navigate = useNavigate()
  return (
    <div className="glass-card rounded-2xl p-5 w-full max-w-sm levitate relative overflow-hidden">
      {/* Glow orb */}
      <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-[#8B5CF6] opacity-20 blur-2xl pointer-events-none" />

      {/* Course header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="tag-cyan mb-2 block">SCIENCE</span>
          <h3 className="font-semibold text-[hsl(var(--text-default))] text-sm leading-snug">
            Quantum Entanglement Explained
          </h3>
        </div>
        <div className="w-8 h-8 rounded-lg bg-[rgba(139,92,246,0.15)] flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-[hsl(var(--text-subtle))] mb-1.5">
          <span>Generation progress</span>
          <span>68%</span>
        </div>
        <div className="h-1.5 rounded-full bg-[rgba(139,92,246,0.15)] overflow-hidden">
          <div
            className="h-full rounded-full gradient-bg"
            style={{ width: "68%" }}
          />
        </div>
      </div>

      {/* Lesson list */}
      <div className="space-y-2">
        {[
          { title: "Wave-Particle Duality", done: true },
          { title: "Quantum Superposition", done: true },
          { title: "Entanglement Explained", done: false },
        ].map((lesson, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2 rounded-lg"
            style={{
              background: lesson.done
                ? "rgba(139,92,246,0.08)"
                : "rgba(255,255,255,0.03)",
            }}
          >
            {lesson.done ? (
              <CheckCircle className="w-3.5 h-3.5 text-[#06B6D4] flex-shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-[rgba(139,92,246,0.40)] flex-shrink-0" />
            )}
            <span className="text-xs text-[hsl(var(--text-default))] font-medium">
              {lesson.title}
            </span>
            {!lesson.done && (
              <span className="ml-auto text-xs text-[#06B6D4] font-mono">Generating...</span>
            )}
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="mt-4 pt-3 border-t border-[rgba(139,92,246,0.15)] flex items-center gap-4 text-xs text-[hsl(var(--text-subtle))]">
        <span className="flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> 12 lessons
        </span>
        <span className="flex items-center gap-1">
          <BarChart3 className="w-3 h-3" /> Quiz included
        </span>
      </div>
    </div>
  );
}

export default function HeroSection() {
    const navigate = useNavigate()
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-24 pb-20 px-6">
      {/* Background orbs */}
      <div
        className="orb w-[600px] h-[600px] bg-[#4E54C8] opacity-25"
        style={{ top: "-100px", left: "8%", animationDelay: "0s" }}
      />
      <div
        className="orb w-[400px] h-[400px] bg-[#06B6D4] opacity-15"
        style={{ top: "200px", right: "3%", animationDelay: "3s" }}
      />
      <div
        className="orb w-[300px] h-[300px] bg-[#8B5CF6] opacity-20"
        style={{ bottom: "50px", left: "20%", animationDelay: "6s" }}
      />

      {/* Radial gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(78,84,200,0.40) 0%, transparent 70%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-[900px] mx-auto">
        {/* Eyebrow */}
        <div
          className="pill-cyan mb-6 animate-fade-in-up"
          style={{ animationDelay: "0ms" }}
        >
          AI-POWERED LEARNING
        </div>

        {/* Headline */}
        <h1
          className="font-extrabold text-[hsl(var(--text-default))] mb-6 animate-fade-in-up"
          style={{
            fontSize: "clamp(40px, 7vw, 72px)",
            lineHeight: 1.1,
            animationDelay: "80ms",
          }}
        >
            Stop Cramming, Learn Visually.{" "}
            <br />
          <span className="gradient-text">Turn any topic into AI-generated visual course.</span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-[hsl(var(--text-subtle))] max-w-[580px] mb-10 animate-fade-in-up"
          style={{ fontSize: "18px", lineHeight: "28px", animationDelay: "160ms" }}
        >
          Level Up AI transforms any subject — from quantum physics to Byzantine
          history — into an immersive, narrated visual course. Just type a topic
          and watch it come to life.
        </p>

        {/* CTA Buttons */}
        <div
          className="flex flex-wrap items-center justify-center gap-4 mb-10 animate-fade-in-up"
          style={{ animationDelay: "240ms" }}
        >
          <button onClick={() => navigate("/dashboard")} className="gradient-bg text-white font-semibold px-8 py-3.5 rounded-xl glow-violet hover:-translate-y-1 transition-transform duration-150 text-base">
            Start Learning Free
          </button>
          <button className="glass-card text-[hsl(var(--text-default))] font-semibold px-8 py-3.5 rounded-xl flex items-center gap-2 hover:border-[rgba(139,92,246,0.45)] hover:-translate-y-0.5 transition-all duration-150 text-base">
            <Play className="w-4 h-4 text-[#8B5CF6]" />
            Watch Demo
          </button>
        </div>

        {/* Animated input */}
        <div
          className="flex flex-col items-center gap-3 w-full animate-fade-in-up"
          style={{ animationDelay: "320ms" }}
        >
          <TypewriterInput />
          <p className="text-xs text-[hsl(var(--text-subtle))]">
            No credit card required · 50+ topics generated today
          </p>
        </div>
      </div>

      {/* Hero card visual */}
      <div
        className="relative z-10 mt-16 animate-fade-in-up"
        style={{ animationDelay: "480ms" }}
      >
        <HeroCard />
      </div>
    </section>
  );
}
