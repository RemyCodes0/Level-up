import { useEffect, useRef } from "react";
import { Monitor, Mic2, FileUp, Target, TrendingUp, Library } from "lucide-react";

const features = [
  {
    icon: Monitor,
    title: "Visual Learning",
    desc: "Dynamic slides, motion graphics, and animated diagrams designed for visual learners who retain more through seeing.",
    accent: "#8B5CF6",
  },
  {
    icon: Mic2,
    title: "AI Narration",
    desc: "Human-quality voice narration guides every lesson. Learn by listening while watching — just like a real teacher.",
    accent: "#06B6D4",
  },
  {
    icon: FileUp,
    title: "PDF Upload",
    desc: "Drop any document — lecture notes, textbooks, study guides — and get a full visual course aligned to your material.",
    accent: "#8B5CF6",
  },
  {
    icon: Target,
    title: "Smart Assessments",
    desc: "Auto-generated 20-question quizzes with adaptive difficulty, calibrated precisely to each lesson's key concepts.",
    accent: "#06B6D4",
  },
  {
    icon: TrendingUp,
    title: "Performance Analytics",
    desc: "Streak tracking, mastery scores, and weak-spot detection so you always know exactly what to review next.",
    accent: "#8B5CF6",
  },
  {
    icon: Library,
    title: "Showcase Library",
    desc: "Browse hundreds of community-generated courses. Start learning instantly — no waiting for generation.",
    accent: "#06B6D4",
  },
];

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cards = entry.target.querySelectorAll(".feature-card");
            cards.forEach((card, i) => {
              setTimeout(() => card.classList.add("revealed"), i * 80);
            });
          }
        });
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="features"
      className="py-24 px-6"
      style={{ background: "hsl(var(--surface))" }}
      ref={sectionRef}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="pill-cyan mb-4 mx-auto w-fit">FEATURES</div>
          <h2 className="section-heading">
            Everything you need to{" "}
            <span className="gradient-text-static">learn deeply</span>
          </h2>
          <p
            className="text-[hsl(var(--text-subtle))] mt-4 max-w-[480px] mx-auto"
            style={{ fontSize: "16px", lineHeight: "24px" }}
          >
            One platform. Six powerful tools. All working together to give you
            the best possible learning experience.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="feature-card scroll-reveal glass-card glass-card-hover rounded-2xl p-7 relative overflow-hidden group"
              >
                {/* Glow orb */}
                <div
                  className="absolute -top-8 -left-8 w-28 h-28 rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity duration-300 pointer-events-none"
                  style={{ background: feature.accent }}
                />

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 relative z-10"
                  style={{
                    background: `${feature.accent}18`,
                    border: `1px solid ${feature.accent}30`,
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: feature.accent }} />
                </div>

                {/* Content */}
                <h3
                  className="font-semibold text-[hsl(var(--text-default))] mb-3 relative z-10"
                  style={{ fontSize: "17px" }}
                >
                  {feature.title}
                </h3>
                <p
                  className="text-[hsl(var(--text-subtle))] relative z-10 leading-relaxed"
                  style={{ fontSize: "14px" }}
                >
                  {feature.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
