import { CheckCircle, Play } from "lucide-react";

const trustItems = [
  "Free forever tier",
  "No credit card",
  "Cancel anytime",
];

export default function CTASection() {
  return (
    <section
      className="py-32 px-6 relative overflow-hidden"
      style={{ background: "hsl(var(--surface))" }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 100% 200% at 50% 50%, rgba(78,84,200,0.35) 0%, rgba(139,92,246,0.15) 45%, transparent 75%)",
        }}
      />
      <div
        className="orb w-[700px] h-[700px] opacity-15 pointer-events-none"
        style={{
          background: "#8B5CF6",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
        }}
      />

      <div className="max-w-[800px] mx-auto text-center relative z-10">
        {/* Eyebrow */}
        <div className="pill-cyan mb-6 mx-auto w-fit">START TODAY — IT'S FREE</div>

        {/* Headline */}
        <h2
          className="font-extrabold mb-6"
          style={{ fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.15 }}
        >
          <span className="text-[hsl(var(--text-default))]">
            Your next breakthrough is{" "}
          </span>
          <span className="gradient-text">one topic away.</span>
        </h2>

        {/* Subheadline */}
        <p
          className="text-[hsl(var(--text-subtle))] mb-10 max-w-[480px] mx-auto"
          style={{ fontSize: "17px", lineHeight: "26px" }}
        >
          Join 50,000+ learners already leveling up. No credit card needed. Start
          generating your first course in seconds.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <button className="gradient-bg text-white font-semibold px-10 py-4 rounded-xl glow-violet hover:-translate-y-1 transition-transform duration-150 text-base">
            Start Learning Free
          </button>
          <button className="glass-card text-[hsl(var(--text-default))] font-semibold px-8 py-4 rounded-xl flex items-center gap-2 hover:border-[rgba(139,92,246,0.45)] hover:-translate-y-0.5 transition-all duration-150 text-base">
            <Play className="w-4 h-4 text-[#8B5CF6]" />
            Watch Demo
          </button>
        </div>

        {/* Trust signals */}
        <div className="flex items-center justify-center flex-wrap gap-6">
          {trustItems.map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 text-[hsl(var(--text-subtle))]"
              style={{ fontSize: "13px" }}
            >
              <CheckCircle className="w-4 h-4 text-[#06B6D4] flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
