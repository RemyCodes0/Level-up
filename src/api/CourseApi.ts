const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// ── Shapes returned by the backend ───────────────────────────────────────────

export interface LessonFromAPI {
  lessonNumber: number;
  title: string;
  description: string;
  keyPoints: string[];
  videoUrl: string | null;
  status: "rendering" | "ready" | "failed";
}

export interface QuestionFromAPI {
  id: number;
  question: string;
  options: string[];
  correct: number;
  topic: string;
}

export interface CourseFromAPI {
  _id: string;
  topic: string;
  status: "generating" | "ready" | "failed";
  lessons: LessonFromAPI[];
  questions: QuestionFromAPI[];
}

// ── Start course generation — returns courseId immediately ───────────────────

export async function startCourseGeneration(
  topic: string,
  file?: File | null
): Promise<{ courseId: string; status: string }> {
  const formData = new FormData();
  if (topic) formData.append("topic", topic);
  if (file) formData.append("file", file);

  const res = await fetch(`${BASE_URL}/api/course/generate`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Failed to start course generation");
  return res.json();
}

// ── Poll a course's status once ──────────────────────────────────────────────

export async function getCourseStatus(courseId: string): Promise<CourseFromAPI> {
  const res = await fetch(`${BASE_URL}/api/course/status/${courseId}`);
  if (!res.ok) throw new Error("Failed to get course status");
  return res.json();
}

// ── Poll repeatedly until the whole course is done ───────────────────────────
// Fires onUpdate every poll with the latest course state, so the UI can
// reflect lessons becoming ready one by one. Stops when status is ready/failed.

export function pollCourse(
  courseId: string,
  onUpdate: (course: CourseFromAPI) => void,
  intervalMs = 5000
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const course = await getCourseStatus(courseId);
      onUpdate(course);
      if (course.status === "ready" || course.status === "failed") {
        stopped = true;
        return;
      }
    } catch (err) {
      console.error("Polling error:", err);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };

  tick();

  // Return a cancel function so the component can stop polling on unmount
  return () => {
    stopped = true;
  };
}