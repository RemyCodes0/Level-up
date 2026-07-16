const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface SceneReplay {
  sceneIndex: number;
  count: number;
}

export interface LessonProgress {
  lessonNumber: number;
  watched: boolean;
  watchedAt: string | null;
  replayCount: number;
  sceneReplays: SceneReplay[];
}

export interface CourseProgress {
  userId: string;
  courseId: string;
  lessons: LessonProgress[];
  completedAt: string | null;
}

// Restores watched-state on load — before this, a refresh always reset
// every lesson back to "not watched" (see AiTutor.tsx's old markComplete).
export async function getProgress(courseId: string): Promise<CourseProgress> {
  const res = await fetch(`${BASE_URL}/api/progress/${courseId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to load progress");
  return res.json();
}

export async function markLessonWatched(courseId: string, lessonNumber: number): Promise<CourseProgress> {
  const res = await fetch(`${BASE_URL}/api/progress/${courseId}/lesson/${lessonNumber}/watched`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to mark lesson watched");
  return res.json();
}

export async function logSceneReplay(courseId: string, lessonNumber: number, sceneIndex?: number): Promise<CourseProgress> {
  const res = await fetch(`${BASE_URL}/api/progress/${courseId}/lesson/${lessonNumber}/replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(typeof sceneIndex === "number" ? { sceneIndex } : {}),
  });
  if (!res.ok) throw new Error("Failed to log replay");
  return res.json();
}
