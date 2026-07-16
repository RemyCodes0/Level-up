import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles, ArrowUp, Clock, CheckCircle, Play, Pause,
  ChevronRight, ChevronLeft, Volume2, Maximize2, ClipboardList,
  Trophy, Zap, BookOpen, LayoutDashboard, PenSquare,
  Target, BarChart3, TrendingUp, Star,
} from "lucide-react";

// Detects small screens so the showcase can drop the desktop-only sidebars
// (which are far too wide for a phone) and show just the main content panel —
// the part that actually demonstrates each step.
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}



// ─── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Enter Topic",   title: "Type what you want to learn", subtitle: "Any subject, instantly structured into a full course" },
  { id: 2, label: "Watch Lessons", title: "Watch visual lessons",         subtitle: "Narrated animated slides with key takeaways" },
  { id: 3, label: "Take Quiz",     title: "Test your understanding",      subtitle: "20 adaptive questions after you finish" },
  { id: 4, label: "See Results",   title: "Track your mastery",           subtitle: "Personalized insights on strengths & gaps" },
];

const STEP_DURATION = 6000;

// ─── Shared sidebar ───────────────────────────────────────────────────────────

function AppSidebar({ step }: { step: number }) {
  const history = step >= 2
    ? ["Give me a course on Neural Networks", "Explain the Fermi Paradox"]
    : [];
  return (
    <div style={{ width: "188px", borderRight: "1px solid #E5E7EB", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%" }}>
      {/* Top icons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ width: "20px", height: "20px", borderRadius: "4px", background: "#E5E7EB" }} />
        <PenSquare style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />
      </div>
      {/* Trial status */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#374151", fontWeight: 500 }}>
            <Zap style={{ width: "12px", height: "12px", color: "#10B981" }} /> Free trial
          </div>
          <span style={{ fontSize: "11px", color: "#10B981", fontWeight: 600 }}>Available</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#374151", fontWeight: 500 }}>
            <LayoutDashboard style={{ width: "12px", height: "12px", color: "#6366F1" }} /> Courses
          </div>
          <span style={{ fontSize: "11px", color: "#374151", fontWeight: 600 }}>0 remaining</span>
        </div>
      </div>
      {/* Divider with green accent */}
      <div style={{ height: "2px", background: "linear-gradient(90deg,#10B981,#06B6D4)", margin: "0" }} />
      {/* History */}
      {history.length > 0 && (
        <div style={{ padding: "8px 0", flex: 1, overflow: "hidden" }}>
          <p style={{ fontSize: "10px", color: "#9CA3AF", padding: "0 12px", marginBottom: "4px" }}>Today</p>
          {history.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "5px 12px",
                fontSize: "11px",
                color: i === 0 ? "#374151" : "#6B7280",
                background: i === 0 ? "#F3F4F6" : "transparent",
                cursor: "pointer",
                lineHeight: 1.3,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Course nav panel ─────────────────────────────────────────────────────────

function CourseNav({ activeLesson, quizActive }: { activeLesson: number; quizActive?: boolean }) {
  const lessons = [
    "Fundamentals of Electric Charge an...",
    "Electric Current, Voltage, and Resist...",
    "Ohm's Law and Basic Circuit Analysis",
    "Series and Parallel Circuits",
    "Electromagnetism and Electromagn...",
    "Alternating Current, Electrical Safet...",
  ];
  return (
    <div style={{ width: "300px", borderRight: "1px solid #E5E7EB", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          <Sparkles style={{ width: "13px", height: "13px", color: "#6366F1" }} />
          <span style={{ fontSize: "11px", color: "#6366F1", fontWeight: 700, letterSpacing: "0.05em" }}>AI COURSE</span>
        </div>
        <p style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Give me a course on electricity</p>
      </div>
      {/* Lessons */}
      <div style={{ padding: "10px 14px 6px", overflowY: "auto", flex: 1 }}>
        <p style={{ fontSize: "10px", color: "#9CA3AF", letterSpacing: "0.08em", marginBottom: "8px" }}>VIDEO LESSONS</p>
        {lessons.map((lesson, i) => {
          const num = i + 1;
          const isActive = num === activeLesson && !quizActive;
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "flex-start", gap: "8px",
                padding: "7px 8px", marginBottom: "2px", borderRadius: "6px",
                background: isActive ? "#EEF2FF" : "transparent",
                borderLeft: isActive ? "3px solid #6366F1" : "3px solid transparent",
                cursor: "pointer",
              }}
            >
              {isActive ? (
                <Play style={{ width: "13px", height: "13px", color: "#6366F1", flexShrink: 0, marginTop: "1px" }} />
              ) : (
                <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "1.5px solid #D1D5DB", flexShrink: 0, marginTop: "1px" }} />
              )}
              <div>
                <p style={{ fontSize: "11.5px", color: isActive ? "#6366F1" : "#374151", fontWeight: isActive ? 600 : 400, lineHeight: 1.3 }}>
                  {num}. {lesson}
                </p>
                <p style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>
                  <Clock style={{ width: "9px", height: "9px" }} /> ~2:00
                </p>
              </div>
            </div>
          );
        })}
        {/* Assessment */}
        <p style={{ fontSize: "10px", color: "#9CA3AF", letterSpacing: "0.08em", margin: "10px 0 8px" }}>ASSESSMENT</p>
        <div
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "7px 8px", borderRadius: "6px",
            background: quizActive ? "#F5F3FF" : "transparent",
            borderLeft: quizActive ? "3px solid #8B5CF6" : "3px solid transparent",
          }}
        >
          <ClipboardList style={{ width: "13px", height: "13px", color: quizActive ? "#8B5CF6" : "#9CA3AF", flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: "11.5px", color: quizActive ? "#8B5CF6" : "#374151", fontWeight: quizActive ? 600 : 400 }}>Final Quiz</p>
            <p style={{ fontSize: "10px", color: "#9CA3AF" }}>20 questions</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 8px", borderRadius: "6px", opacity: 0.5 }}>
          <Trophy style={{ width: "13px", height: "13px", color: "#9CA3AF", flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: "11.5px", color: "#9CA3AF" }}>Results & Recommendations</p>
            <p style={{ fontSize: "10px", color: "#9CA3AF" }}>Readiness score</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step screens (main content area) ────────────────────────────────────────

function InputScreen({ active }: { active: boolean }) {
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const topic = "Explain DNA replication and cell division";
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!active) { setTyped(""); setDone(false); return; }
    let i = 0; setTyped(""); setDone(false);
    const type = () => {
      if (i <= topic.length) { setTyped(topic.slice(0, i)); i++; timerRef.current = setTimeout(type, 55); }
      else { timerRef.current = setTimeout(() => setDone(true), 500); }
    };
    timerRef.current = setTimeout(type, 600);
    return () => clearTimeout(timerRef.current);
  }, [active]);

  const chips = ["Cell Biology lecture slides", "Calculus II integration techniques", "Data structures & algorithms", "Electromagnetic waves"];

  return (
    <div style={{ flex: 1, background: "#F9FAFB", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", overflowY: "auto" }}>
      {/* App icon */}
      <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px", boxShadow: "0 4px 16px rgba(99,102,241,0.35)" }}>
        <Sparkles style={{ width: "24px", height: "24px", color: "#fff" }} />
      </div>

      <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#111827", marginBottom: "6px", textAlign: "center" }}>
        What would you like to learn?
      </h2>
      <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "20px", textAlign: "center" }}>
        Describe your topic or upload your course materials — AI generates your full course.
      </p>

      {/* Input box */}
      <div style={{ width: "100%", maxWidth: "540px", background: "#fff", borderRadius: "14px", border: done ? "1.5px solid #6366F1" : "1.5px solid #E5E7EB", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "14px", transition: "border-color 0.3s" }}>
        <div style={{ padding: "14px 16px", minHeight: "56px", display: "flex", alignItems: "flex-start" }}>
          <span style={{ fontSize: "13px", color: typed ? "#111827" : "#9CA3AF", lineHeight: 1.5 }}>
            {typed || "Explain DNA replication and cell division…"}
            {active && !done && (
              <span style={{ display: "inline-block", width: "2px", height: "14px", background: "#6366F1", marginLeft: "2px", verticalAlign: "middle", animation: "typewriterBlink 1s ease-in-out infinite" }} />
            )}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "1px solid #F3F4F6", background: "#FAFAFA" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#9CA3AF" }}>
            <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "1.5px solid #D1D5DB", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "10px", color: "#9CA3AF" }}>+</span>
            </div>
            PDF (100 pages max) · PPTX — up to 25MB
          </div>
          <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: done ? "#6366F1" : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.3s" }}>
            <ArrowUp style={{ width: "14px", height: "14px", color: done ? "#fff" : "#9CA3AF" }} />
          </div>
        </div>
      </div>

      {/* Suggestion chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", maxWidth: "560px", marginBottom: "16px" }}>
        {chips.map((chip) => (
          <button key={chip} style={{ padding: "6px 14px", borderRadius: "999px", border: "1.5px solid #E5E7EB", background: "#fff", fontSize: "11.5px", color: "#374151", cursor: "pointer", fontWeight: 500 }}>
            {chip}
          </button>
        ))}
      </div>

      <p style={{ fontSize: "11px", color: "#9CA3AF" }}>
        Lesson 1 ready in ~5 minutes · remaining lessons load while you watch
      </p>
    </div>
  );
}

function LessonScreen({ active }: { active: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) { setPlaying(false); setProgress(0); return; }
    const t = setTimeout(() => setPlaying(true), 600);
    return () => clearTimeout(t);
  }, [active]);

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setProgress((p) => p >= 100 ? 0 : p + 0.5), 50);
    return () => clearInterval(iv);
  }, [playing]);

  const keyPoints = [
    "A current-carrying conductor produces a magnetic field around it, with the field direction determined by the right-hand rule",
    "An electromagnet is created by coiling a current-carrying wire around a ferromagnetic core, and its strength depends on current, number of coils, and core material",
    "Faraday's Law of Electromagnetic Induction states that a changing magnetic field through a coil induces an electromotive force (voltage) in that coil",
    "Lenz's Law states that the direction of an induced current always opposes the change in magnetic flux that produced it, ensuring conservation of energy",
  ];

  const elapsed = Math.floor((progress / 100) * 206);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  return (
    <div style={{ flex: 1, background: "#F9FAFB", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Hide nav label */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "4px", borderBottom: "1px solid #F3F4F6", background: "#fff" }}>
        <ChevronLeft style={{ width: "13px", height: "13px", color: "#6B7280" }} />
        <span style={{ fontSize: "12px", color: "#6B7280" }}>Hide course nav</span>
      </div>

      {/* Video player */}
      <div style={{ position: "relative", background: "#0D0C1A", aspectRatio: "16/7", overflow: "hidden", flexShrink: 0 }}>
        {/* Animated scene */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="100%" height="100%" viewBox="0 0 700 220" preserveAspectRatio="xMidYMid meet">
            {/* Background glow */}
            <ellipse cx="200" cy="110" rx="120" ry="80" fill="rgba(78,84,200,0.15)" />
            <ellipse cx="500" cy="110" rx="100" ry="70" fill="rgba(139,92,246,0.12)" />
            {/* Orbital rings */}
            {[0, 1, 2].map((i) => (
              <ellipse key={i} cx="200" cy="110" rx={60 + i * 30} ry={30 + i * 15}
                fill="none" stroke={`rgba(99,102,241,${0.5 - i * 0.12})`} strokeWidth="1.5"
                transform={`rotate(${i * 30} 200 110)`}>
                {active && <animateTransform attributeName="transform" type="rotate" from={`${i * 30} 200 110`} to={`${i * 30 + 360} 200 110`} dur={`${4 + i}s`} repeatCount="indefinite" />}
              </ellipse>
            ))}
            {/* Right element */}
            {[0, 1, 2].map((i) => (
              <ellipse key={i} cx="500" cy="110" rx={55 + i * 25} ry={28 + i * 14}
                fill="none" stroke={`rgba(139,92,246,${0.45 - i * 0.10})`} strokeWidth="1.5"
                transform={`rotate(${-i * 40} 500 110)`}>
                {active && <animateTransform attributeName="transform" type="rotate" from={`${-i * 40} 500 110`} to={`${-i * 40 - 360} 500 110`} dur={`${5 + i}s`} repeatCount="indefinite" />}
              </ellipse>
            ))}
            {/* Center dots */}
            <circle cx="200" cy="110" r="5" fill="#6366F1" />
            <circle cx="500" cy="110" r="5" fill="#8B5CF6" />
          </svg>
        </div>
        {/* Video controls */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.75))", padding: "12px 14px 10px" }}>
          {/* Progress bar */}
          <div style={{ height: "3px", background: "rgba(255,255,255,0.25)", borderRadius: "2px", marginBottom: "8px", cursor: "pointer" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#6366F1", borderRadius: "2px", transition: "width 0.1s linear" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => setPlaying((p) => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {playing ? <Pause style={{ width: "16px", height: "16px", color: "#fff" }} /> : <Play style={{ width: "16px", height: "16px", color: "#fff" }} />}
            </button>
            <Volume2 style={{ width: "14px", height: "14px", color: "#fff" }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)", fontFamily: "monospace" }}>
              {elapsedMin}:{String(elapsedSec).padStart(2, "0")} / 3:26
            </span>
            <div style={{ flex: 1 }} />
            <Maximize2 style={{ width: "14px", height: "14px", color: "#fff" }} />
          </div>
        </div>
      </div>

      {/* Key points */}
      <div style={{ background: "#fff", padding: "16px 20px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "12px" }}>
          <BookOpen style={{ width: "15px", height: "15px", color: "#6366F1" }} />
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Key points in this lesson</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {keyPoints.map((point, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <CheckCircle style={{ width: "14px", height: "14px", color: "#10B981", flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "12px", color: "#374151", lineHeight: 1.5, textAlign: "center" }}>{point}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuizScreen({ active }: { active: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!active) { setSelected(null); setConfirmed(false); return; }
    const t1 = setTimeout(() => setSelected(3), 1400);
    const t2 = setTimeout(() => setConfirmed(true), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [active]);

  const answered = [0, 1, 2, 3, 4]; // question indices answered
  const current = 5; // 0-indexed (Q6)
  const options = ["Length of the wire", "Cross-sectional area of the wire", "Material of the wire", "The color of the wire's insulation"];
  const correct = 3;

  return (
    <div style={{ flex: 1, background: "#F9FAFB", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Hide nav */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "4px", borderBottom: "1px solid #F3F4F6", background: "#fff" }}>
        <ChevronLeft style={{ width: "13px", height: "13px", color: "#6B7280" }} />
        <span style={{ fontSize: "12px", color: "#6B7280" }}>Hide course nav</span>
      </div>

      {/* Quiz content */}
      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#111827", display: "flex", alignItems: "center", gap: "8px" }}>
              <ClipboardList style={{ width: "18px", height: "18px", color: "#8B5CF6" }} />
              Learning Assessment
            </h2>
            <p style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>5 of 20 answered</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "8px", background: "#F3F4F6" }}>
            <Clock style={{ width: "12px", height: "12px", color: "#6B7280" }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", fontFamily: "monospace" }}>29:50</span>
          </div>
        </div>

        {/* Question number grid */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {Array.from({ length: 20 }, (_, i) => {
            const qNum = i + 1;
            const isAnswered = answered.includes(i);
            const isCurrent = i === current;
            return (
              <div key={i} style={{
                width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 600, cursor: "pointer",
                background: isCurrent ? "#6366F1" : isAnswered ? "#E0E7FF" : "#fff",
                color: isCurrent ? "#fff" : isAnswered ? "#6366F1" : "#9CA3AF",
                border: isCurrent ? "2px solid #6366F1" : isAnswered ? "1px solid #C7D2FE" : "1px solid #E5E7EB",
              }}>
                {qNum}
              </div>
            );
          })}
        </div>

        {/* Question card */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "16px", border: "1px solid #E5E7EB", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ padding: "3px 10px", borderRadius: "999px", background: "#F3F4F6", fontSize: "11px", color: "#6B7280", fontWeight: 600 }}>
              Electric Current, Voltage, and Resistance
            </span>
            <span style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: 600 }}>Q6 / 20</span>
          </div>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "#111827", textAlign: "center", marginBottom: "16px" }}>
            Which factor does NOT affect the resistance of a wire?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = selected === i;
              const showCorrect = confirmed && i === correct;
              return (
                <button
                  key={i}
                  onClick={() => !confirmed && setSelected(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "11px 14px", borderRadius: "8px", border: "1.5px solid",
                    borderColor: showCorrect ? "#10B981" : isSelected && !confirmed ? "#6366F1" : "#E5E7EB",
                    background: showCorrect ? "#F0FDF4" : isSelected && !confirmed ? "#EEF2FF" : "#fff",
                    cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: showCorrect ? "#10B981" : isSelected && !confirmed ? "#6366F1" : "#F3F4F6",
                    border: showCorrect ? "none" : isSelected && !confirmed ? "none" : "1.5px solid #D1D5DB",
                    fontSize: "11px", fontWeight: 700,
                    color: (showCorrect || (isSelected && !confirmed)) ? "#fff" : "#6B7280",
                  }}>
                    {showCorrect ? <CheckCircle style={{ width: "13px", height: "13px" }} /> : letter}
                  </div>
                  <span style={{ fontSize: "13px", color: showCorrect ? "#065F46" : "#374151", fontWeight: showCorrect ? 600 : 400 }}>
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button style={{ display: "flex", alignItems: "center", gap: "5px", padding: "9px 18px", borderRadius: "8px", border: "1.5px solid #E5E7EB", background: "#fff", fontSize: "13px", fontWeight: 600, color: "#374151", cursor: "pointer" }}>
            <ChevronLeft style={{ width: "14px", height: "14px" }} /> Previous
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: "5px", padding: "9px 22px", borderRadius: "8px", background: "#6366F1", border: "none", fontSize: "13px", fontWeight: 600, color: "#fff", cursor: "pointer" }}>
            Next <ChevronRight style={{ width: "14px", height: "14px" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsScreen({ active }: { active: boolean }) {
  const [barH, setBarH] = useState([0, 0, 0, 0, 0, 0]);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (!active) { setBarH([0, 0, 0, 0, 0, 0]); setScore(0); return; }
    const targets = [88, 95, 72, 90, 82, 94];
    const t = setTimeout(() => {
      targets.forEach((h, i) => setTimeout(() => setBarH((prev) => { const n = [...prev]; n[i] = h; return n; }), i * 180));
    }, 300);
    let s = 0;
    const iv = setInterval(() => { s = Math.min(s + 2, 87); setScore(s); if (s >= 87) clearInterval(iv); }, 28);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [active]);

  const topics = ["Fund.", "Current", "Ohm's", "Series", "E-Mag", "AC"];
  const strengths = ["Electric Current", "Series Circuits", "Alternating Current"];
  const review = ["Ohm's Law", "Electromagnetism"];

  return (
    <div style={{ flex: 1, background: "#F9FAFB", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Hide nav */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "4px", borderBottom: "1px solid #F3F4F6", background: "#fff" }}>
        <ChevronLeft style={{ width: "13px", height: "13px", color: "#6B7280" }} />
        <span style={{ fontSize: "12px", color: "#6B7280" }}>Hide course nav</span>
      </div>

      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Results header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#111827", display: "flex", alignItems: "center", gap: "7px" }}>
            <Trophy style={{ width: "18px", height: "18px", color: "#F59E0B" }} />
            Results & Recommendations
          </h2>
        </div>

        {/* Score + rating row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          {[
            { label: "Overall Score", value: `${score}%`, sub: "17 / 20 correct", accent: "#6366F1", bg: "#EEF2FF" },
            { label: "Mastery Level", value: "Advanced", sub: "Top 15% of learners", accent: "#10B981", bg: "#ECFDF5" },
            { label: "Time Taken", value: "14:32", sub: "Avg: 22:00 min", accent: "#F59E0B", bg: "#FFFBEB" },
          ].map((card) => (
            <div key={card.label} style={{ background: "#fff", borderRadius: "10px", padding: "14px", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize: "10px", color: "#9CA3AF", marginBottom: "4px", fontWeight: 600, letterSpacing: "0.05em" }}>{card.label.toUpperCase()}</p>
              <p style={{ fontSize: "20px", fontWeight: 800, color: card.accent, lineHeight: 1 }}>{card.value}</p>
              <p style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "4px" }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Star rating */}
        <div style={{ background: "#fff", borderRadius: "10px", padding: "12px 16px", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", gap: "3px" }}>
            {[...Array(5)].map((_, i) => (
              <Star key={i} style={{ width: "16px", height: "16px", color: i < 4 ? "#F59E0B" : "#E5E7EB" }} fill={i < 4 ? "#F59E0B" : "none"} />
            ))}
          </div>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>4.0 / 5.0</span>
          <span style={{ fontSize: "12px", color: "#9CA3AF" }}>— Excellent performance!</span>
        </div>

        {/* Bar chart */}
        <div style={{ background: "#fff", borderRadius: "10px", padding: "14px 16px", border: "1px solid #E5E7EB" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "12px", display: "flex", alignItems: "center", gap: "5px" }}>
            <BarChart3 style={{ width: "13px", height: "13px", color: "#6366F1" }} /> Topic Mastery Breakdown
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "72px" }}>
            {barH.map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%" }}>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", borderRadius: "4px 4px 0 0", background: h >= 85 ? "linear-gradient(180deg,#6366F1,#8B5CF6)" : h >= 75 ? "linear-gradient(180deg,#06B6D4,#6366F1)" : "linear-gradient(180deg,#F87171,#EF4444)", height: `${h}%`, minHeight: "4px", transition: "height 0.5s cubic-bezier(0.34,1.56,0.64,1)" }} />
                </div>
                <span style={{ fontSize: "9px", color: "#9CA3AF", textAlign: "center" }}>{topics[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths & Review */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[
            { title: "Strengths", items: strengths, icon: TrendingUp, color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0" },
            { title: "Review These", items: review, icon: Target, color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A" },
          ].map(({ title, items, icon: Icon, color, bg, border }) => (
            <div key={title} style={{ background: bg, borderRadius: "10px", padding: "12px 14px", border: `1px solid ${border}` }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color, marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Icon style={{ width: "12px", height: "12px" }} /> {title}
              </p>
              {items.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
                  <CheckCircle style={{ width: "11px", height: "11px", color, flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", color: "#374151" }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Browser mockup wrapper ───────────────────────────────────────────────────

function BrowserMockup({ currentStep, screenKey, isMobile }: { currentStep: number; screenKey: number; isMobile: boolean }) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "920px", margin: "0 auto" }}>
      {/* Outer glow */}
      <div style={{ position: "absolute", inset: "-1px", borderRadius: "14px", background: "linear-gradient(135deg,rgba(99,102,241,0.35),rgba(139,92,246,0.20),rgba(6,182,212,0.25))", filter: "blur(8px)", zIndex: 0 }} />

      {/* Browser shell */}
      <div style={{ position: "relative", zIndex: 1, borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 64px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.06)" }}>
        {/* Browser chrome */}
        <div style={{ background: "#1E1B2E", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Traffic lights */}
          <div style={{ display: "flex", gap: "6px" }}>
            {["#FF5F57", "#FFBD2E", "#28C840"].map((c) => (
              <div key={c} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c }} />
            ))}
          </div>
          {/* URL bar */}
          <div style={{ flex: 1, background: "rgba(255,255,255,0.07)", borderRadius: "6px", padding: "4px 12px", display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.50)", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              leveluppedu/ai_tutor
            </span>
          </div>
          {/* Tab area */}
          <div style={{ display: "flex", gap: "4px" }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
        </div>

        {/* App content */}
        <div
          key={screenKey}
          style={{ display: "flex", height: isMobile ? "440px" : "420px", background: "#fff", animation: "fadeIn 0.35s ease-out both" }}
        >
          {/* Sidebars are desktop-only — far too wide for a phone. On mobile we
              show just the main content panel, which is what actually
              demonstrates each step. */}
          {!isMobile && <AppSidebar step={currentStep} />}
          {currentStep === 1 ? (
            <InputScreen active={true} />
          ) : (
            <>
              {!isMobile && <CourseNav activeLesson={currentStep === 3 ? -1 : 5} quizActive={currentStep === 3} />}
              {currentStep === 2 && <LessonScreen active={true} />}
              {currentStep === 3 && <QuizScreen active={true} />}
              {currentStep === 4 && <ResultsScreen active={true} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function VideoShowcaseSection() {
  const isMobile = useIsMobile();
  const [currentStep, setCurrentStep] = useState(1);
  const [screenKey, setScreenKey] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [stepProgress, setStepProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const progressRef = useRef<ReturnType<typeof setInterval>>();

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
    setScreenKey((k) => k + 1);
    setStepProgress(0);
  }, []);

  const nextStep = useCallback(() => goToStep((currentStep % STEPS.length) + 1), [currentStep, goToStep]);
  const prevStep = useCallback(() => goToStep(currentStep === 1 ? STEPS.length : currentStep - 1), [currentStep, goToStep]);

  useEffect(() => {
    if (!autoPlay) { clearInterval(intervalRef.current); clearInterval(progressRef.current); return; }
    setStepProgress(0);
    clearInterval(progressRef.current);
    progressRef.current = setInterval(() => setStepProgress((p) => Math.min(p + 100 / (STEP_DURATION / 50), 100)), 50);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentStep((s) => { const next = (s % STEPS.length) + 1; setScreenKey((k) => k + 1); setStepProgress(0); return next; });
    }, STEP_DURATION);
    return () => { clearInterval(intervalRef.current); clearInterval(progressRef.current); };
  }, [autoPlay]);

  const step = STEPS[currentStep - 1];

  return (
     <div>
      {/* Background */}
      
      <div className="max-w-[1100px] mx-auto relative z-10 px-4 sm:px-0">
      

        {/* Step pills */}
        <div
          className="flex items-center justify-start sm:justify-center gap-2 mb-8 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-2 sm:pb-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {STEPS.map((s) => {
            const isActive = s.id === currentStep;
            return (
              <button
                key={s.id}
                onClick={() => { setAutoPlay(false); goToStep(s.id); }}
                className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 shrink-0"
                style={{
                  background: isActive ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "rgba(255,255,255,0.05)",
                  border: isActive ? "1px solid rgba(99,102,241,0.50)" : "1px solid rgba(255,255,255,0.10)",
                  boxShadow: isActive ? "0 0 16px rgba(99,102,241,0.30)" : "none",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span
                  style={{
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: isActive ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 700, fontFamily: "monospace",
                  }}
                >
                  {s.id}
                </span>
                {s.label}
                {isActive && autoPlay && (
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
                    <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(255,255,255,0.80)" strokeWidth="1.5" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 5.5}`}
                      strokeDashoffset={`${2 * Math.PI * 5.5 * (1 - stepProgress / 100)}`}
                      style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 0.1s linear" }}
                    />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Pause/play */}
          <button
            onClick={() => setAutoPlay((a) => !a)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all duration-200 shrink-0"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)", fontSize: "11px" }}
          >
            {autoPlay ? <Pause style={{ width: "11px", height: "11px" }} /> : <Play style={{ width: "11px", height: "11px" }} />}
            {autoPlay ? "Pause" : "Play"}
          </button>
        </div>

        {/* Browser mockup */}
        <BrowserMockup currentStep={currentStep} screenKey={screenKey} isMobile={isMobile} />

        {/* Step description + nav */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
          {/* Description */}
          <div key={`desc-${step.id}`} style={{ animation: "fadeIn 0.4s ease-out both" }}>
            <p style={{ fontSize: "14px", fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>
              <span style={{ fontFamily: "monospace", color: "#8B5CF6", marginRight: "8px" }}>
                {String(step.id).padStart(2, "0")} / 04
              </span>
              {step.title}
            </p>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.40)", marginTop: "3px" }}>{step.subtitle}</p>
          </div>

          {/* Nav buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => { setAutoPlay(false); prevStep(); }}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl transition-all duration-150 hover:-translate-y-0.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.55)", fontSize: "13px" }}
            >
              <ChevronLeft style={{ width: "14px", height: "14px" }} /> Prev
            </button>
            <button
              onClick={() => { setAutoPlay(false); nextStep(); }}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl transition-all duration-150 hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg,#4E54C8,#8B5CF6)", border: "1px solid rgba(139,92,246,0.40)", color: "#fff", fontSize: "13px", fontWeight: 600, boxShadow: "0 0 14px rgba(139,92,246,0.30)" }}
            >
              Next <ChevronRight style={{ width: "14px", height: "14px" }} />
            </button>
          </div>
        </div>

        {/* Dot nav */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => { setAutoPlay(false); goToStep(s.id); }}
              aria-label={`Step ${s.id}`}
              style={{ width: s.id === currentStep ? "24px" : "8px", height: "8px", borderRadius: "4px", background: s.id === currentStep ? "linear-gradient(90deg,#6366F1,#8B5CF6)" : "rgba(255,255,255,0.15)", transition: "all 0.3s ease", border: "none", cursor: "pointer" }}
            />
          ))}
        </div>
      </div>
     </div>
  );
}