import { useState, useEffect, useRef } from "react";
import { BookOpen, Star, ArrowRight } from "lucide-react";

const allCourses = [
  {
    title: "Quantum Entanglement Explained",
    category: "Science",
    lessons: 12,
    learners: "1,240",
    rating: 4.9,
    gradient: "from-[#4E54C8] via-[#8B5CF6] to-[#06B6D4]",
    animation: "quantum",
  },
  {
    title: "The Fall of the Roman Empire",
    category: "History",
    lessons: 18,
    learners: "3,820",
    rating: 4.8,
    gradient: "from-[#8B5CF6] via-[#C084FC] to-[#4E54C8]",
    animation: "columns",
  },
  {
    title: "Neural Networks from Scratch",
    category: "Technology",
    lessons: 24,
    learners: "5,601",
    rating: 4.9,
    gradient: "from-[#06B6D4] via-[#4E54C8] to-[#8B5CF6]",
    animation: "neural",
  },
  {
    title: "Renaissance Art & Its Secrets",
    category: "Arts",
    lessons: 15,
    learners: "2,103",
    rating: 4.7,
    gradient: "from-[#F59E0B] via-[#8B5CF6] to-[#4E54C8]",
    animation: "art",
  },
  {
    title: "The Human Immune System",
    category: "Science",
    lessons: 20,
    learners: "4,450",
    rating: 4.9,
    gradient: "from-[#10B981] via-[#06B6D4] to-[#4E54C8]",
    animation: "immune",
  },
  {
    title: "Blockchain & Web3 Fundamentals",
    category: "Technology",
    lessons: 16,
    learners: "6,789",
    rating: 4.8,
    gradient: "from-[#4E54C8] via-[#06B6D4] to-[#10B981]",
    animation: "blockchain",
  },
];

const filters = ["All", "Science", "History", "Technology", "Arts"];

// ── Per-card animations ────────────────────────────────────────────────────
function QuantumAnimation() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes orbit1 { from { transform: rotate(0deg) translateX(38px) rotate(0deg); } to { transform: rotate(360deg) translateX(38px) rotate(-360deg); } }
        @keyframes orbit2 { from { transform: rotate(120deg) translateX(54px) rotate(-120deg); } to { transform: rotate(480deg) translateX(54px) rotate(-480deg); } }
        @keyframes orbit3 { from { transform: rotate(240deg) translateX(70px) rotate(-240deg); } to { transform: rotate(600deg) translateX(70px) rotate(-600deg); } }
        @keyframes pulse-core { 0%,100% { transform: scale(1); opacity:0.9; } 50% { transform: scale(1.3); opacity:1; } }
        @keyframes entangle { 0%,100% { opacity:0.2; stroke-dashoffset:0; } 50% { opacity:0.7; stroke-dashoffset:20; } }
      `}</style>
      {/* Entanglement line */}
      <svg className="absolute" width="160" height="160" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
        <line x1="40" y1="80" x2="120" y2="80" stroke="white" strokeWidth="1" strokeDasharray="6 4"
          style={{ animation: "entangle 2s ease-in-out infinite" }} />
      </svg>
      {/* Core */}
      <div style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: "white", boxShadow: "0 0 16px 4px rgba(255,255,255,0.6)", animation: "pulse-core 2s ease-in-out infinite", position: "absolute" }} />
      {/* Orbiting electrons */}
      {[
        { anim: "orbit1 3s linear infinite" },
        { anim: "orbit2 4.5s linear infinite" },
        { anim: "orbit3 6s linear infinite" },
      ].map((o, i) => (
        <div key={i} style={{ position: "absolute", width: 8, height: 8, borderRadius: "50%", backgroundColor: i === 0 ? "#67e8f9" : i === 1 ? "#a78bfa" : "#6ee7b7", boxShadow: `0 0 8px 2px ${i === 0 ? "#67e8f9" : i === 1 ? "#a78bfa" : "#6ee7b7"}`, animation: o.anim }} />
      ))}
      {/* Orbital rings */}
      {[38, 54, 70].map((r, i) => (
        <div key={i} style={{ position: "absolute", width: r * 2, height: r * 2, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)" }} />
      ))}
    </div>
  );
}

function ColumnsAnimation() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes col-rise { 0%,100% { transform: scaleY(0.85) translateY(4px); } 50% { transform: scaleY(1) translateY(0); } }
        @keyframes col-fall { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
      `}</style>
      <div className="flex items-end gap-2" style={{ height: 80 }}>
        {[60, 80, 50, 90, 70, 45, 85].map((h, i) => (
          <div key={i} style={{
            width: 12, height: h * 0.7,
            background: `rgba(255,255,255,${0.25 + i * 0.08})`,
            borderRadius: "3px 3px 0 0",
            animation: `col-rise ${1.5 + i * 0.2}s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }} />
        ))}
      </div>
      {/* Decorative arch suggesting Roman architecture */}
      <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 90, height: 20, borderTop: "2px solid rgba(255,255,255,0.3)", borderRadius: "50% 50% 0 0" }} />
    </div>
  );
}

function NeuralAnimation() {
  const nodes = [
    { x: 20, y: 50 },
    { x: 50, y: 25 }, { x: 50, y: 50 }, { x: 50, y: 75 },
    { x: 80, y: 38 }, { x: 80, y: 62 },
    { x: 110, y: 50 },
  ];
  const edges = [
    [0,1],[0,2],[0,3],
    [1,4],[1,5],[2,4],[2,5],[3,4],[3,5],
    [4,6],[5,6],
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes signal { 0% { stroke-dashoffset: 40; opacity:0; } 40% { opacity:1; } 100% { stroke-dashoffset: 0; opacity:0; } }
        @keyframes node-pulse { 0%,100% { r:4; opacity:0.7; } 50% { r:6; opacity:1; } }
      `}</style>
      <svg width="140" height="100" viewBox="0 0 130 100">
        {edges.map(([a, b], i) => (
          <line key={i}
            x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
            stroke="rgba(255,255,255,0.25)" strokeWidth="1"
          />
        ))}
        {edges.map(([a, b], i) => (
          <line key={`s${i}`}
            x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
            stroke="#67e8f9" strokeWidth="1.5" strokeDasharray="8 32"
            style={{ animation: `signal 2s linear infinite`, animationDelay: `${i * 0.18}s` }}
          />
        ))}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={4}
            fill={i === 0 ? "#a78bfa" : i === nodes.length - 1 ? "#6ee7b7" : "#60a5fa"}
            style={{ animation: `node-pulse ${1.5 + i * 0.2}s ease-in-out infinite`, animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

function ArtAnimation() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes brush { 0% { stroke-dashoffset: 200; opacity:0; } 60% { opacity:1; } 100% { stroke-dashoffset: 0; opacity:0.8; } }
        @keyframes palette-bob { 0%,100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(-4px) rotate(5deg); } }
        @keyframes golden-ratio { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <svg width="140" height="110" viewBox="0 0 140 110">
        {/* Golden spiral suggestion */}
        <path d="M70 55 Q90 35 110 55 Q90 75 70 55 Q50 35 70 15 Q90 35 110 55"
          fill="none" stroke="rgba(255,215,0,0.3)" strokeWidth="1"
          style={{ animation: "brush 3s ease-in-out infinite" }} />
        {/* Brushstroke */}
        <path d="M25 80 Q50 40 80 60 Q100 72 120 45"
          fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5"
          strokeLinecap="round" strokeDasharray="120" strokeDashoffset="120"
          style={{ animation: "brush 2.5s ease-in-out infinite 0.5s" }} />
        {/* Color dots — palette */}
        {[["#ef4444",30,85],["#f59e0b",45,90],["#10b981",60,87],["#60a5fa",75,92],["#a78bfa",90,85]].map(([c,x,y],i) => (
          <circle key={i} cx={x} cy={y} r={5} fill={c as string} opacity={0.85}
            style={{ animation: `palette-bob ${1.5 + i*0.2}s ease-in-out infinite`, animationDelay: `${i*0.15}s` }} />
        ))}
        {/* Frame */}
        <rect x="20" y="10" width="100" height="70" rx="3" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function ImmuneAnimation() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes cell-float { 0%,100% { transform: translate(0,0); } 33% { transform: translate(4px,-6px); } 66% { transform: translate(-4px,3px); } }
        @keyframes antibody { 0%,100% { opacity:0.4; transform: scale(0.9); } 50% { opacity:1; transform: scale(1.1); } }
        @keyframes pathogen-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <svg width="150" height="120" viewBox="0 0 150 120">
        {/* T-cells */}
        {[[30,40],[120,70],[45,85]].map(([x,y],i) => (
          <g key={i} style={{ animation: `cell-float ${2+i*0.7}s ease-in-out infinite`, animationDelay: `${i*0.4}s`, transformOrigin: `${x}px ${y}px` }}>
            <circle cx={x} cy={y} r={10} fill="rgba(110,231,183,0.3)" stroke="#6ee7b7" strokeWidth="1.5" />
            <circle cx={x} cy={y} r={4} fill="#6ee7b7" />
          </g>
        ))}
        {/* Pathogen */}
        <g style={{ transformOrigin: "80px 55px", animation: "pathogen-spin 6s linear infinite" }}>
          {[0,45,90,135,180,225,270,315].map((deg, i) => (
            <line key={i}
              x1={80} y1={55}
              x2={80 + Math.cos(deg*Math.PI/180)*18}
              y2={55 + Math.sin(deg*Math.PI/180)*18}
              stroke="rgba(248,113,113,0.7)" strokeWidth="1.5" strokeLinecap="round" />
          ))}
          <circle cx={80} cy={55} r={8} fill="rgba(248,113,113,0.4)" stroke="#f87171" strokeWidth="1.5" />
        </g>
        {/* Antibodies */}
        {[[60,30],[105,45],[95,80]].map(([x,y],i) => (
          <g key={i} style={{ animation: `antibody ${1.8+i*0.3}s ease-in-out infinite`, animationDelay: `${i*0.3}s`, transformOrigin: `${x}px ${y}px` }}>
            <path d={`M${x} ${y} L${x-6} ${y+8} M${x} ${y} L${x+6} ${y+8}`}
              stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" fill="none" />
            <circle cx={x} cy={y} r={3} fill="#60a5fa" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function BlockchainAnimation() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes block-glow { 0%,100% { box-shadow: 0 0 6px rgba(103,232,249,0.4); } 50% { box-shadow: 0 0 16px rgba(103,232,249,0.9); } }
        @keyframes chain-flow { 0% { stroke-dashoffset: 20; } 100% { stroke-dashoffset: 0; } }
        @keyframes hash-scroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
      `}</style>
      <div className="relative flex items-center gap-1">
        {[0,1,2,3].map((i) => (
          <div key={i} className="flex items-center gap-1">
            <div style={{
              width: 36, height: 44, borderRadius: 6,
              background: "rgba(255,255,255,0.08)",
              border: "1.5px solid rgba(103,232,249,0.5)",
              animation: `block-glow ${1.5 + i * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              overflow: "hidden", position: "relative",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 5, color: "rgba(103,232,249,0.5)", lineHeight: 1.4, padding: "2px 3px", animation: "hash-scroll 3s linear infinite", animationDelay: `${i*0.4}s` }}>
                  {["A3F1","B7C2","D9E4","F2A8","C5B1","E8D3","A3F1","B7C2"].map((h,j)=><div key={j}>{h}</div>)}
                </div>
              </div>
            </div>
            {i < 3 && (
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M1 6 L11 6 M7 2 L11 6 L7 10" stroke="#67e8f9" strokeWidth="1.5" fill="none" strokeLinecap="round"
                  style={{ animation: "chain-flow 1s linear infinite", strokeDasharray: "20", strokeDashoffset: "20", animationDelay: `${i*0.3}s` }} />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const ANIMATIONS: Record<string, () => JSX.Element> = {
  quantum: QuantumAnimation,
  columns: ColumnsAnimation,
  neural: NeuralAnimation,
  art: ArtAnimation,
  immune: ImmuneAnimation,
  blockchain: BlockchainAnimation,
};

const filters_list = ["All", "Science", "History", "Technology", "Arts"];

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
          {filters_list.map((filter) => (
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
          {filtered.map((course) => {
            const AnimComp = ANIMATIONS[course.animation];
            return (
              <div
                key={course.title}
                className="course-card scroll-reveal glass-card glass-card-hover rounded-2xl overflow-hidden relative group"
              >
                {/* Glow orb */}
                <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-[#8B5CF6] opacity-20 blur-2xl pointer-events-none group-hover:opacity-40 transition-opacity duration-300" />

                {/* Animated thumbnail */}
                <div className={`h-40 bg-gradient-to-br ${course.gradient} relative overflow-hidden`}>
                  <AnimComp />
                  {/* Category tag */}
                  <div className="absolute top-3 left-3 z-10">
                    <span className="tag-cyan">{course.category.toUpperCase()}</span>
                  </div>
                  {/* Lessons count */}
                  <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded-md px-2 py-1">
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
                    <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-subtle))]">
                      <div className="flex -space-x-1.5">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="w-5 h-5 rounded-full border border-[rgba(139,92,246,0.30)] bg-gradient-to-br from-[#4E54C8] to-[#8B5CF6]" />
                        ))}
                      </div>
                      <span>{course.learners} learners</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-medium text-[hsl(var(--text-default))]">
                        {course.rating}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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