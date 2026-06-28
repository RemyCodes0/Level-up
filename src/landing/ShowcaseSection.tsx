import { useState, useEffect, useRef } from "react";
import { BookOpen, Star, Users, ArrowRight } from "lucide-react";



const allCourses = [
  {
    title: "Quantum Entanglement Explained",
    category: "Science",
    lessons: 12,
    learners: "1,240",
    rating: 4.9,
    gradient: "from-[#4E54C8] via-[#8B5CF6] to-[#06B6D4]",
  },
  {
    title: "The Fall of the Roman Empire",
    category: "History",
    lessons: 18,
    learners: "3,820",
    rating: 4.8,
    gradient: "from-[#8B5CF6] via-[#C084FC] to-[#4E54C8]",
  },
  {
    title: "Neural Networks from Scratch",
    category: "Technology",
    lessons: 24,
    learners: "5,601",
    rating: 4.9,
    gradient: "from-[#06B6D4] via-[#4E54C8] to-[#8B5CF6]",
  },
  {
    title: "Renaissance Art & Its Secrets",
    category: "Arts",
    lessons: 15,
    learners: "2,103",
    rating: 4.7,
    gradient: "from-[#F59E0B] via-[#8B5CF6] to-[#4E54C8]",
  },
  {
    title: "The Human Immune System",
    category: "Science",
    lessons: 20,
    learners: "4,450",
    rating: 4.9,
    gradient: "from-[#10B981] via-[#06B6D4] to-[#4E54C8]",
  },
  {
    title: "Blockchain & Web3 Fundamentals",
    category: "Technology",
    lessons: 16,
    learners: "6,789",
    rating: 4.8,
    gradient: "from-[#4E54C8] via-[#06B6D4] to-[#10B981]",
  },
];

const filters = ["All", "Science", "History", "Technology", "Arts"];

export default function ShowcaseSection() {
  const [activeFilter, setActiveFilter] = useState("All");
  const sectionRef = useRef<HTMLDivElement>(null);

  const filtered =
    activeFilter === "All"
      ? allCourses
      : allCourses.filter((c) => c.category === activeFilter);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cards = entry.target.querySelectorAll(".course-card");
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
      id="showcase"
      className="py-24 px-6"
      style={{ background: "hsl(var(--surface))" }}
      ref={sectionRef}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="pill-cyan mb-4 mx-auto w-fit">SHOWCASE LIBRARY</div>
          <h2 className="section-heading">
            Explore{" "}
            <span className="gradient-text-static">500+ courses</span>
          </h2>
          <p
            className="text-[hsl(var(--text-subtle))] mt-4 max-w-[480px] mx-auto"
            style={{ fontSize: "16px", lineHeight: "24px" }}
          >
            Browse community-generated courses. Start learning instantly — no
            generation wait time.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-10">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                activeFilter === filter
                  ? "gradient-bg text-white glow-violet"
                  : "glass-card text-[hsl(var(--text-subtle))] hover:text-[hsl(var(--text-default))]"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Course grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((course) => (
            <div
              key={course.title}
              className="course-card scroll-reveal glass-card glass-card-hover rounded-2xl overflow-hidden relative group"
            >
              {/* Glow orb */}
              <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-[#8B5CF6] opacity-20 blur-2xl pointer-events-none group-hover:opacity-40 transition-opacity duration-300" />

              {/* Thumbnail */}
              <div
                className={`h-40 bg-gradient-to-br ${course.gradient} relative overflow-hidden`}
              >
                {/* Decorative pattern */}
                <div className="absolute inset-0 opacity-20">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute rounded-full border border-white"
                      style={{
                        width: `${60 + i * 30}px`,
                        height: `${60 + i * 30}px`,
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  ))}
                </div>
                {/* Category tag */}
                <div className="absolute top-3 left-3">
                  <span className="tag-cyan">{course.category.toUpperCase()}</span>
                </div>
                {/* Lessons count */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded-md px-2 py-1">
                  <BookOpen className="w-3 h-3 text-white" />
                  <span className="text-white text-xs font-medium">
                    {course.lessons} lessons
                  </span>
                </div>
              </div>

              {/* Card body */}
              <div className="p-5">
                <h3
                  className="font-semibold text-[hsl(var(--text-default))] mb-3 leading-snug"
                  style={{ fontSize: "15px" }}
                >
                  {course.title}
                </h3>

                <div className="flex items-center justify-between">
                  {/* Learners */}
                  <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-subtle))]">
                    <div className="flex -space-x-1.5">
                      {[...Array(3)].map((_, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-full border border-[rgba(139,92,246,0.30)] bg-gradient-to-br from-[#4E54C8] to-[#8B5CF6]"
                        />
                      ))}
                    </div>
                    <span>{course.learners} learners</span>
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-medium text-[hsl(var(--text-default))]">
                      {course.rating}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
          <button className="glass-card text-[hsl(var(--text-default))] font-semibold px-8 py-3.5 rounded-xl flex items-center gap-2 mx-auto hover:border-[rgba(139,92,246,0.45)] hover:-translate-y-0.5 transition-all duration-150">
            Browse 500+ Courses
            <ArrowRight className="w-4 h-4 text-[#8B5CF6]" />
          </button>
        </div>
      </div>
    </section>
  );
}
