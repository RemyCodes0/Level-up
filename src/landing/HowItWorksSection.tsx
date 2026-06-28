import { useEffect, useRef } from "react";
import { Upload, Sparkles, Play, CheckSquare, BarChart3 } from "lucide-react";



const steps = [
  {
    num: "01",
    icon: Upload,
    label: "Input Topic / PDF",
    desc: "Type any topic or upload a PDF — lecture notes, textbooks, study guides.",
    color: "#8B5CF6",
  },
  {
    num: "02",
    icon: Sparkles,
    label: "Course Generation",
    desc: "AI analyzes your request and instantly builds a personalized visual curriculum.",
    color: "#6D6CE8",
  },
  {
    num: "03",
    icon: Play,
    label: "Visual Lessons",
    desc: "Watch narrated, animated lesson slides with diagrams and motion graphics.",
    color: "#06B6D4",
  },
  {
    num: "04",
    icon: CheckSquare,
    label: "Smart Assessment",
    desc: "Adaptive 20-question quizzes test and reinforce your understanding.",
    color: "#8B5CF6",
  },
  {
    num: "05",
    icon: BarChart3,
    label: "Learning Analytics",
    desc: "Track mastery, identify weak spots, and get personalized review recommendations.",
    color: "#06B6D4",
  },
];

export default function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cards = entry.target.querySelectorAll(".step-card");
            cards.forEach((card, i) => {
              setTimeout(() => {
                card.classList.add("revealed");
              }, i * 100);
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
      id="how-it-works"
      className="py-24 px-6"
      style={{ background: "hsl(var(--surface-raised))" }}
      ref={sectionRef}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="pill-cyan mb-4 mx-auto w-fit">THE PROCESS</div>
          <h2 className="section-heading">
            From topic to mastery{" "}
            <span className="gradient-text-static">in minutes</span>
          </h2>
          <p
            className="text-[hsl(var(--text-subtle))] mt-4 max-w-[500px] mx-auto"
            style={{ fontSize: "16px", lineHeight: "24px" }}
          >
            Five simple steps. Zero wasted time. A complete learning experience
            built just for you.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop only) */}
          <div
            className="hidden lg:block absolute top-[52px] left-[12%] right-[12%] border-t border-dashed"
            style={{ borderColor: "rgba(139,92,246,0.25)" }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.num}
                  className="step-card scroll-reveal flex flex-col items-center text-center relative"
                >
                  {/* Step number + icon */}
                  <div className="relative mb-5">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10"
                      style={{
                        background: `linear-gradient(135deg, ${step.color}22, ${step.color}44)`,
                        border: `1px solid ${step.color}40`,
                      }}
                    >
                      <Icon className="w-6 h-6" style={{ color: step.color }} />
                    </div>
                    <span
                      className="absolute -top-2 -right-2 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        color: step.color,
                        background: `${step.color}18`,
                        border: `1px solid ${step.color}30`,
                      }}
                    >
                      {step.num}
                    </span>
                  </div>

                  <h3
                    className="font-semibold text-[hsl(var(--text-default))] mb-2"
                    style={{ fontSize: "15px" }}
                  >
                    {step.label}
                  </h3>
                  <p
                    className="text-[hsl(var(--text-subtle))]"
                    style={{ fontSize: "13px", lineHeight: "20px" }}
                  >
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
