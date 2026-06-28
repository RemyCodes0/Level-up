import { useEffect, useRef } from "react";
import { GraduationCap, BookOpen, Compass, Briefcase, ArrowRight } from "lucide-react";



const users = [
  {
    icon: GraduationCap,
    role: "University Students",
    headline: "Ace complex topics before finals",
    desc: "Upload your lecture notes or type any course topic. Get a visual course that turns weeks of content into clarity — fast.",
    accent: "#8B5CF6",
    gradient: "from-[#8B5CF6] to-[#4E54C8]",
  },
  {
    icon: BookOpen,
    role: "High School Students",
    headline: "Visual learning that actually sticks",
    desc: "Difficult subjects become engaging animated lessons. Study smarter, understand deeper, and remember more on exam day.",
    accent: "#06B6D4",
    gradient: "from-[#06B6D4] to-[#4E54C8]",
  },
  {
    icon: Compass,
    role: "Self-Learners",
    headline: "Explore any curiosity, fast",
    desc: "Any topic, any time. From Byzantine history to quantum computing — get a structured, visual course in minutes.",
    accent: "#8B5CF6",
    gradient: "from-[#8B5CF6] to-[#06B6D4]",
  },
  {
    icon: Briefcase,
    role: "Professionals",
    headline: "Upskill on new domains instantly",
    desc: "Stay ahead with personalized courses on new frameworks, industries, and skills — no course hunting required.",
    accent: "#06B6D4",
    gradient: "from-[#4E54C8] to-[#8B5CF6]",
  },
];

export default function TargetUsersSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cards = entry.target.querySelectorAll(".user-card");
            cards.forEach((card, i) => {
              setTimeout(() => card.classList.add("revealed"), i * 100);
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
      className="py-24 px-6"
      style={{ background: "hsl(var(--surface-raised))" }}
      ref={sectionRef}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="pill-cyan mb-4 mx-auto w-fit">WHO IT'S FOR</div>
          <h2 className="section-heading">
            Built for every{" "}
            <span className="gradient-text-static">kind of learner</span>
          </h2>
          <p
            className="text-[hsl(var(--text-subtle))] mt-4 max-w-[480px] mx-auto"
            style={{ fontSize: "16px", lineHeight: "24px" }}
          >
            Whether you're studying for finals or exploring a new passion, Level
            Up AI adapts to you.
          </p>
        </div>

        {/* User cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {users.map((user) => {
            const Icon = user.icon;
            return (
              <div
                key={user.role}
                className="user-card scroll-reveal glass-card glass-card-hover rounded-2xl p-6 flex flex-col relative overflow-hidden group"
              >
                {/* Background glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${user.accent}15, transparent 60%)`,
                  }}
                />

                {/* Avatar */}
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${user.gradient} flex items-center justify-center mb-5 flex-shrink-0`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>

                {/* Role badge */}
                <span
                  className="pill-violet mb-3 w-fit text-[10px]"
                  style={{
                    color: user.accent,
                    borderColor: `${user.accent}40`,
                    background: `${user.accent}12`,
                  }}
                >
                  {user.role}
                </span>

                {/* Content */}
                <h3
                  className="font-semibold text-[hsl(var(--text-default))] mb-3 leading-snug"
                  style={{ fontSize: "16px" }}
                >
                  {user.headline}
                </h3>
                <p
                  className="text-[hsl(var(--text-subtle))] flex-1 leading-relaxed"
                  style={{ fontSize: "13px" }}
                >
                  {user.desc}
                </p>

                <button
                  className="mt-5 flex items-center gap-1 text-sm font-medium hover:gap-2 transition-all duration-150"
                  style={{ color: user.accent }}
                >
                  See how <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
