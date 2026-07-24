"use client";

import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  ChevronLeft, ChevronRight, Play, AlertCircle,
  BookOpen, Clock, ArrowLeft, GraduationCap, MessageSquare,
} from "lucide-react";
import { getShowcaseCourses } from "../api/CourseApi";
import type { CourseFromAPI } from "../api/CourseApi";
import { DynamicPlayer } from "../remotion/DynamicPlayer";
import { FeedbackModal } from "../feedback/FeedBackModel";
import { PageMeta } from "../components/PageMeta";

// ── Subject-coded accents — one per course card, not one repeated brand color ──
// Cycles if there are ever more than 6 courses; stable assignment by index.
const SUBJECT_ACCENTS = [
  { ink: "#A6432B", tint: "#F6E6E0", label: "ALG" }, // terracotta — algorithms/CS
  { ink: "#2C5F6B", tint: "#E2EEF0", label: "PHY" }, // deep teal — physics
  { ink: "#6B5B3E", tint: "#EFE8DA", label: "HUM" }, // ochre — humanities/history
  { ink: "#3D4F7A", tint: "#E4E7F2", label: "CS"  }, // indigo — software/tech
  { ink: "#5C7A3E", tint: "#E8EEDF", label: "CHM" }, // moss — chemistry
  { ink: "#7A3E5C", tint: "#F1E1E9", label: "MTH" }, // plum — math/mechanics
];

function getAccent(index: number) {
  return SUBJECT_ACCENTS[index % SUBJECT_ACCENTS.length];
}

// Shortens a topic prompt like "Explain me Dijkstra's algorithm" into a
// syllabus-style course title — strips the conversational prefix the AI
// tutor prompt naturally produces, since this is a catalog, not a chat log.
function toCourseTitle(topic: string): string {
  return topic
    .replace(/^(explain me|teach me|will|how does|what is)\s*/i, "")
    .replace(/^the\s+/i, "")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export default function ShowcasePage() {
  const [courses, setCourses] = useState<CourseFromAPI[] | null>(null);
  const [error, setError] = useState(false);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [activeLessonIdx, setActiveLessonIdx] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getShowcaseCourses();
        if (!cancelled) setCourses(data);
      } catch (err) {
        console.error("Failed to load showcase courses:", err);
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openCourse = courses?.find((c) => c._id === openCourseId) ?? null;

  return (
    <div style={{ background: "#FAF8F3", minHeight: "100vh" }}>
      <PageMeta
        title="Course Catalog — Real AI-Generated Lessons | Level Up"
        description="Six real courses, dozens of animated lessons — every one generated end to end by AI, narrated, animated, and quizzed. Browse the catalog and press play."
        canonical="/ai_showcase"
      />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Helmet>

      {/* Structured Data: the catalog as an ItemList of Course entries, so
          search engines can understand (and potentially rich-result) the
          actual AI-generated content on this page, not just its title/description. */}
      {courses && courses.length > 0 && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "Level Up AI — Course Catalog",
            "itemListElement": courses.map((course, i) => ({
              "@type": "ListItem",
              "position": i + 1,
              "item": {
                "@type": "Course",
                "name": toCourseTitle(course.topic),
                "description": `An AI-generated, narrated, animated video course on ${toCourseTitle(course.topic)} — ${course.lessons.length} lessons and a ${course.questions.length}-question quiz.`,
                "provider": {
                  "@type": "Organization",
                  "name": "Level Up AI",
                  "sameAs": "https://leveluppedu.app",
                },
                "hasCourseInstance": {
                  "@type": "CourseInstance",
                  "courseMode": "online",
                  "courseWorkload": `${course.lessons.length} video lessons`,
                },
              },
            })),
          })}</script>
        </Helmet>
      )}

      <style>{`
        .sc-root { font-family: 'Inter', sans-serif; color: #1C2333; }
        .sc-display { font-family: 'Fraunces', serif; }
        .sc-mono { font-family: 'JetBrains Mono', monospace; }

        .sc-container {
          max-width: 1140px;
          margin: 0 auto;
          padding: 0 24px;
        }

        .sc-hero {
          padding: 88px 0 64px;
          text-align: center;
        }

        .sc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          padding-bottom: 96px;
        }

        .sc-syllabus-wrap {
          padding: 40px 24px 96px;
        }

        .sc-syllabus-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(220px, 1fr);
          gap: 32px;
        }

        .sc-lesson-nav {
          display: flex;
          justify-content: space-between;
          margin-top: 24px;
          gap: 12px;
        }

        .sc-feedback-card {
          margin-top: 48px;
          padding: 28px 28px 24px;
          background: #fff;
          border: 1px solid #E7E2D5;
          border-radius: 12px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .sc-card {
          text-align: left;
          background: #fff;
          border: 1px solid #E7E2D5;
          border-radius: 10px;
          padding: 22px 22px 20px;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        /* ── Tablet ── */
        @media (max-width: 860px) {
          .sc-syllabus-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .sc-syllabus-wrap {
            padding: 32px 20px 72px;
          }
        }

        /* ── Mobile ── */
        @media (max-width: 640px) {
          .sc-container {
            padding: 0 16px;
          }
          .sc-hero {
            padding: 56px 0 44px;
          }
          .sc-grid {
            grid-template-columns: 1fr;
            gap: 14px;
            padding-bottom: 64px;
          }
          .sc-syllabus-wrap {
            padding: 24px 16px 56px;
          }
          .sc-card {
            padding: 18px 18px 16px;
          }
          .sc-lesson-nav button {
            flex: 1;
            justify-content: center;
            padding: 11px 14px !important;
          }
          .sc-feedback-card {
            flex-direction: column;
            padding: 22px 20px 20px;
            gap: 12px;
          }
          .sc-feedback-card button {
            width: 100%;
            justify-content: center;
          }
        }

        @media (max-width: 400px) {
          .sc-hero {
            padding: 44px 0 36px;
          }
        }
      `}</style>

      <div className="sc-root">
        {!openCourse ? (
          <CatalogView
            courses={courses}
            error={error}
            onOpen={(id) => { setOpenCourseId(id); setActiveLessonIdx(0); }}
            onFeedback={() => setShowFeedback(true)}
          />
        ) : (
          <SyllabusView
            course={openCourse}
            accentIndex={courses!.findIndex((c) => c._id === openCourse._id)}
            activeLessonIdx={activeLessonIdx}
            onSelectLesson={setActiveLessonIdx}
            onBack={() => setOpenCourseId(null)}
            onFeedback={() => setShowFeedback(true)}
          />
        )}

        {showFeedback && (
          <FeedbackModal
            onClose={() => setShowFeedback(false)}
            courseId={openCourse?._id ?? null}
            courseName={openCourse ? toCourseTitle(openCourse.topic) : undefined}
          />
        )}
      </div>
    </div>
  );
}

// ─── Catalog grid ──────────────────────────────────────────────────────────

function CatalogView({
  courses, error, onOpen, onFeedback,
}: {
  courses: CourseFromAPI[] | null;
  error: boolean;
  onOpen: (id: string) => void;
  onFeedback: () => void;
}) {
  return (
    <div className="sc-container">
      {/* ── Hero ── */}
      <header className="sc-hero">
        <p
          className="sc-mono"
          style={{
            fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#8A8270", marginBottom: 18,
          }}
        >
          Course catalog · generated, not recorded
        </p>
        <h1
          className="sc-display"
          style={{
            fontSize: "clamp(30px, 7vw, 56px)", fontWeight: 600, lineHeight: 1.08,
            letterSpacing: "-0.01em", margin: "0 0 20px",
          }}
        >
          6 real courses.<br />36 real lessons.
        </h1>
        <p style={{ fontSize: 17, color: "#5B5648", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          Every video below was generated end to end by AI — narrated, animated, and quizzed.
          Pick a subject and press play.
        </p>
      </header>

      {/* ── Grid / loading / error states ── */}
      {error ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <AlertCircle size={28} style={{ color: "#A6432B", marginBottom: 12 }} />
          <p style={{ color: "#5B5648" }}>Couldn't load the catalog. Try refreshing.</p>
        </div>
      ) : !courses ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <p style={{ color: "#8A8270" }}>Loading the catalog…</p>
        </div>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <GraduationCap size={28} style={{ color: "#8A8270", marginBottom: 12 }} />
          <p style={{ color: "#5B5648" }}>No courses in the catalog yet.</p>
        </div>
      ) : (
        <div className="sc-grid">
          {courses.map((course, i) => {
            const accent = getAccent(i);
            const readyLessons = course.lessons.filter((l) => l.status === "ready").length;
            return (
              <button
                key={course._id}
                onClick={() => onOpen(course._id)}
                className="sc-card"
                style={{ borderLeft: `4px solid ${accent.ink}` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 10px 24px -8px rgba(28,35,51,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <span
                    className="sc-mono"
                    style={{
                      fontSize: 11, fontWeight: 500, letterSpacing: "0.08em",
                      color: accent.ink, background: accent.tint,
                      padding: "3px 8px", borderRadius: 4,
                    }}
                  >
                    {accent.label}-{String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="sc-mono" style={{ fontSize: 11, color: "#A39C8B", display: "flex", alignItems: "center", gap: 5 }}>
                    <Clock size={11} /> 6 lessons
                  </span>
                </div>
                <h3
                  className="sc-display"
                  style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.25, margin: "0 0 10px" }}
                >
                  {toCourseTitle(course.topic)}
                </h3>
                <p style={{ fontSize: 13.5, color: "#7A7464", margin: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <BookOpen size={13} />
                  {readyLessons}/{course.lessons.length} lessons ready · {course.questions.length}-question quiz
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Feedback card ── */}
      <div className="sc-feedback-card">
        <div
          style={{
            width: 44, height: 44, borderRadius: "50%", background: "#E4E7F2",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <MessageSquare size={20} style={{ color: "#3D4F7A" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1C2333", margin: "0 0 4px" }}>
            Got feedback on the catalog?
          </h3>
          <p style={{ fontSize: 13.5, color: "#7A7464", margin: "0 0 14px", lineHeight: 1.5 }}>
            This is where you can tell us what's working, what's missing, or what surprised you.
          </p>
          <button
            onClick={onFeedback}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: "#1C2333", color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: "pointer", transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            <MessageSquare size={15} />
            Leave feedback
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Syllabus + player view ──────────────────────────────────────────────

function SyllabusView({
  course, accentIndex, activeLessonIdx, onSelectLesson, onBack, onFeedback,
}: {
  course: CourseFromAPI;
  accentIndex: number;
  activeLessonIdx: number;
  onSelectLesson: (i: number) => void;
  onBack: () => void;
  onFeedback: () => void;
}) {
  const accent = getAccent(accentIndex);
  const lesson = course.lessons[activeLessonIdx];

  return (
    <div className="sc-container sc-syllabus-wrap">
      <button
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          color: "#7A7464", fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 28,
        }}
      >
        <ArrowLeft size={15} /> Back to catalog
      </button>

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
        <span
          className="sc-mono"
          style={{
            fontSize: 12, fontWeight: 500, letterSpacing: "0.08em",
            color: accent.ink, background: accent.tint, padding: "3px 9px", borderRadius: 4,
          }}
        >
          {accent.label}-{String(accentIndex + 1).padStart(2, "0")}
        </span>
      </div>
      <h1 className="sc-display" style={{ fontSize: "clamp(26px, 6vw, 40px)", fontWeight: 600, margin: "8px 0 36px", letterSpacing: "-0.01em" }}>
        {toCourseTitle(course.topic)}
      </h1>

      <div className="sc-syllabus-grid">
        {/* Player */}
        <div>
          {!lesson.code ? (
            <div
              style={{
                aspectRatio: "16/9", background: "#1C2333", borderRadius: 10,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 10, color: "#fff",
              }}
            >
              <AlertCircle size={24} style={{ opacity: 0.6 }} />
              <p style={{ fontSize: 14, opacity: 0.7 }}>This lesson isn't ready yet.</p>
            </div>
          ) : (
            <DynamicPlayer code={lesson.code} durationInFrames={lesson.totalFrames ?? 3600} />
          )}
          <div style={{ marginTop: 18 }}>
            <h2 className="sc-display" style={{ fontSize: "clamp(17px, 3vw, 20px)", fontWeight: 600, margin: "0 0 8px" }}>
              {activeLessonIdx + 1}. {lesson.title}
            </h2>
            <p style={{ fontSize: 14.5, color: "#5B5648", lineHeight: 1.6, margin: 0 }}>
              {lesson.description}
            </p>
          </div>

          <div className="sc-lesson-nav">
            <button
              onClick={() => onSelectLesson(Math.max(0, activeLessonIdx - 1))}
              disabled={activeLessonIdx === 0}
              style={navBtnStyle(activeLessonIdx === 0)}
            >
              <ChevronLeft size={15} /> Previous
            </button>
            <button
              onClick={() => onSelectLesson(Math.min(course.lessons.length - 1, activeLessonIdx + 1))}
              disabled={activeLessonIdx === course.lessons.length - 1}
              style={navBtnStyle(activeLessonIdx === course.lessons.length - 1)}
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Syllabus list */}
        <aside>
          <p className="sc-mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#A39C8B", textTransform: "uppercase", margin: "0 0 12px" }}>
            Syllabus
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {course.lessons.map((l, i) => {
              const isActive = i === activeLessonIdx;
              return (
                <button
                  key={l.lessonNumber ?? i}
                  onClick={() => onSelectLesson(i)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
                    background: isActive ? accent.tint : "transparent",
                    border: "1px solid", borderColor: isActive ? accent.ink : "transparent",
                    borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                  }}
                >
                  <span
                    className="sc-mono"
                    style={{ fontSize: 12, color: isActive ? accent.ink : "#A39C8B", marginTop: 1, minWidth: 18 }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.4, color: isActive ? "#1C2333" : "#5B5648", fontWeight: isActive ? 600 : 400 }}>
                    {l.title}
                  </span>
                  {isActive && <Play size={12} style={{ color: accent.ink, marginTop: 2, marginLeft: "auto", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {/* ── Feedback card ── */}
      <div className="sc-feedback-card">
        <div
          style={{
            width: 44, height: 44, borderRadius: "50%", background: accent.tint,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <MessageSquare size={20} style={{ color: accent.ink }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1C2333", margin: "0 0 4px" }}>
            What did you think of this course?
          </h3>
          <p style={{ fontSize: 13.5, color: "#7A7464", margin: "0 0 14px", lineHeight: 1.5 }}>
            These lessons were entirely AI-generated. This is where you leave feedback — what worked, what didn't, what surprised you.
          </p>
          <button
            onClick={onFeedback}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: accent.ink, color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: "pointer", transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            <MessageSquare size={15} />
            Leave feedback
          </button>
        </div>
      </div>
    </div>
  );
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
    background: "none", border: "1px solid #E7E2D5", borderRadius: 8,
    padding: "9px 16px", fontSize: 13.5, color: disabled ? "#C9C3B5" : "#1C2333",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}