const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// ── Auth helper ──────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Shapes returned by the backend ───────────────────────────────────────────

export interface LessonFromAPI {
  lessonNumber: number;
  title: string;
  description: string;
  keyPoints: string[];
  videoUrl: string | null;
  // Browser-compiled player fields
  code: string | null;
  totalFrames: number | null;
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
  createdAt?: string;
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
    headers: { ...authHeaders() },
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to start course generation");
  return res.json();
}

// ── Poll a course's status once ──────────────────────────────────────────────
export async function getCourseStatus(courseId: string): Promise<CourseFromAPI> {
  const res = await fetch(`${BASE_URL}/api/course/status/${courseId}`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to get course status");
  return res.json();
}

// ── List the logged-in user's saved courses (for the sidebar on page load) ───
export async function listCourses(): Promise<CourseFromAPI[]> {
  const res = await fetch(`${BASE_URL}/api/course/list`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to list courses");
  return res.json();
}

// ── Delete a course ──────────────────────────────────────────────────────────
export async function deleteCourse(courseId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to delete course");
}

// ── Fetch the curated public showcase courses (no auth required) ────────────
export async function getShowcaseCourses(): Promise<CourseFromAPI[]> {
  const res = await fetch(`${BASE_URL}/api/course/showcase`);
  if (!res.ok) throw new Error("Failed to load showcase courses");
  return res.json();
}

// ── Poll repeatedly until the whole course is done ───────────────────────────
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
  return () => { stopped = true; };
}