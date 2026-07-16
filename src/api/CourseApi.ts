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
  status: "rendering" | "ready" | "failed" | "locked";
  error?: string | null;
  // True for a lesson generated from a collaborative room's group quiz
  // weaknesses (see remedialService.js) rather than the original course plan.
  isRemedial?: boolean;
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
  isFreeTrialCourse?: boolean;
  isShared?: boolean;
  isPublished?: boolean;
  publishedAt?: string | null;
}

// ── Start course generation — returns courseId immediately ───────────────────
export async function startCourseGeneration(
  topic: string,
  file?: File | null,
  level?: "beginner" | "intermediate" | "advanced" | null
): Promise<{ courseId: string; status: string }> {
  const formData = new FormData();
  if (topic) formData.append("topic", topic);
  if (file) formData.append("file", file);
  if (level) formData.append("level", level);

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
export interface ListCoursesResult {
  courses: CourseFromAPI[];
  hasMore: boolean;
}

export async function listCourses(page = 1, limit = 8): Promise<ListCoursesResult> {
  const res = await fetch(`${BASE_URL}/api/course/list?page=${page}&limit=${limit}`, {
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

// ── Retry a failed/broken lesson (rebuilds scene + audio + code) ─────────────
export async function retryLesson(courseId: string, lessonIndex: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/retry/${lessonIndex}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to retry lesson");
}

// ── Unlock the rest of a free-trial course (costs 1 credit) ─────────────────
// Throws an error with a "no_credits" message if the user doesn't have a
// credit available — the caller should catch this and prompt them to buy one.
export async function unlockCourse(courseId: string): Promise<{ ok: true; message: string }> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/unlock`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to unlock course");
  }
  return data;
}

// ── Fetch the curated public showcase courses (no auth required) ────────────
export async function getShowcaseCourses(): Promise<CourseFromAPI[]> {
  const res = await fetch(`${BASE_URL}/api/course/showcase`);
  if (!res.ok) throw new Error("Failed to load showcase courses");
  return res.json();
}

// ── Continuous learning: AI-suggested next courses ───────────────────────────
export interface NextCourseSuggestion {
  topic: string;
  reason: string;
}

export async function getNextSuggestions(courseId: string): Promise<NextCourseSuggestion[]> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/next-suggestions`, {
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load suggestions");
  return data.suggestions;
}

// ── Publish / unpublish a course to the public gallery (owner-only) ─────────
export interface PublishResult {
  isPublished: true;
  publishedAt: string;
  shareUrl: string;
}

export async function publishCourse(courseId: string): Promise<PublishResult> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/publish`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to publish course");
  return data;
}

export async function unpublishCourse(courseId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/publish`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to unpublish course");
}

// ── Public gallery: search + paginate published courses (no auth) ───────────
export interface PublicGalleryCourse {
  _id: string;
  topic: string;
  publishedAt: string;
  shareUrl: string;
  author: string;
}

export interface PublicGalleryResult {
  courses: PublicGalleryCourse[];
  nextCursor: string | null;
}

export async function listPublicCourses(
  q = "",
  cursor: string | null = null,
  limit = 12
): Promise<PublicGalleryResult> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set("q", q);
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`${BASE_URL}/api/course/public?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load the public gallery");
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