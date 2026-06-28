import { useEffect, useRef } from "react";
import { Star } from "lucide-react";



const testimonials = [
  {
    quote:
      "I used to dread studying. Level Up AI made learning quantum mechanics feel like watching Netflix. I actually look forward to it now.",
    name: "Maya T.",
    role: "Biomedical Engineering Student",
    gradient: "from-[#8B5CF6] to-[#4E54C8]",
  },
  {
    quote:
      "Uploaded my 200-page research PDF and had a full visual course in under 60 seconds. The narration was incredibly clear and on-point.",
    name: "Jordan K.",
    role: "Independent Researcher",
    gradient: "from-[#06B6D4] to-[#4E54C8]",
  },
  {
    quote:
      "My whole team upskills on new frameworks weekly. Level Up AI replaced three different tools for us. It's the only learning platform we need.",
    name: "Priya S.",
    role: "Engineering Lead, Series B Startup",
    gradient: "from-[#4E54C8] to-[#8B5CF6]",
  },
];

export default function TestimonialsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cards = entry.target.querySelectorAll(".testimonial-card");
            cards.forEach((card, i) => {
              setTimeout(() => card.classList.add("revealed"), i * 120);
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
        {/* Social proof bar */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className="w-4 h-4 fill-amber-400 text-amber-400"
              />
            ))}
            <span
              className="ml-1 font-mono text-[#06B6D4]"
              style={{ fontSize: "13px" }}
            >
              4.9/5 from 2,400+ learners
            </span>
          </div>
          <div className="pill-cyan mb-4 mx-auto w-fit">TESTIMONIALS</div>
          <h2 className="section-heading">
            Loved by learners{" "}
            <span className="gradient-text-static">worldwide</span>
          </h2>
        </div>

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="testimonial-card scroll-reveal glass-card glass-card-hover rounded-2xl p-7 flex flex-col relative overflow-hidden"
            >
              {/* Opening quote mark */}
              <span
                className="gradient-text-static font-serif leading-none mb-3 block"
                style={{ fontSize: "48px", lineHeight: 1 }}
              >
                &ldquo;
              </span>

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p
                className="text-[hsl(var(--text-default))] leading-relaxed flex-1"
                style={{ fontSize: "15px" }}
              >
                {t.quote}
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 mt-6 pt-5 border-t border-[rgba(139,92,246,0.15)]">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex-shrink-0`}
                />
                <div>
                  <p
                    className="font-semibold text-[hsl(var(--text-default))]"
                    style={{ fontSize: "14px" }}
                  >
                    {t.name}
                  </p>
                  <p
                    className="text-[hsl(var(--text-subtle))]"
                    style={{ fontSize: "12px" }}
                  >
                    {t.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
