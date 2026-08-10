const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// ── Auth helper ──────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// A 401 here means the stored token is missing/expired/invalid — the server
// is rejecting every request as that user, not anything to do with course
// generation itself. Before this check existed, every authenticated call in
// this file just threw a generic "Failed to ..." error that calling code
// either logged to the console and silently gave up (pollCourse, and
// AiTutor.tsx's lazy code-backfill fetch) or surfaced as an unhelpful
// message — with NOTHING telling the user their session had died, and
// nothing retrying, a course whose lesson genuinely finished generating
// would show "generating" FOREVER, since the one fetch that would have
// populated its code never got a working retry path. Same sign-out
// sequence as AiTutor.tsx's handleLogout / Profile.tsx's handleLogout (this
// is a plain module, not a component, so it can't call useNavigate() —
// a full-page redirect is also the safest recovery here anyway, since it
// resets whatever stale React state the silent failures left behind).
function handleUnauthorized(res: Response) {
  if (res.status !== 401) return;
  localStorage.removeItem("user");
  localStorage.removeItem("token");
  if (typeof window !== "undefined") window.location.href = "/login";
}

// ── Shapes returned by the backend ───────────────────────────────────────────

// One entry per expected scene, populated incrementally WHILE a lesson is
// still generating — powers a passive progress filmstrip (real thumbnails
// appearing in order, no playback). See Course.js's sceneProgressSchema for
// the backend side of this.
export interface SceneProgressItem {
  index: number;
  durationInFrames: number | null;
  label: string;
  audioReady: boolean;
  codeReady: boolean;
  previewCode: string | null;
}

// One entry per FINAL scene in an already-built lesson (as opposed to
// SceneProgressItem above, which only exists mid-generation) — the frame
// range each scene occupies in the stitched playback timeline. See
// Course.js's sceneMetaSchema for the backend side, and courseController.js's
// retrySceneHandler for the existing server-side "which scene is this crash
// frame in" lookup (`lesson.scenes.find(s => crashFrame >= s.startFrame &&
// crashFrame < s.endFrame)`) that DynamicPlayer's own auto-skip mirrors on
// the client to find the NEXT scene to jump to.
export interface SceneMetaItem {
  index: number;
  startFrame: number;
  endFrame: number;
  label: string;
}

export interface LessonFromAPI {
  lessonNumber: number;
  title: string;
  description: string;
  keyPoints: string[];
  videoUrl: string | null;
  // Browser-compiled player fields
  code: string | null;
  totalFrames: number | null;
  sceneProgress?: SceneProgressItem[];
  // Only present once the lesson has actually finished building (same
  // "final vs mid-generation" split as sceneProgress above) — see
  // SceneMetaItem's own comment.
  scenes?: SceneMetaItem[];
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
  // Tier snapshot at generation time (null tier = free trial or a legacy
  // no-tier request) — see server/models/Course.js.
  tier?: string | null;
  tierName?: string;
  lessonCount?: number;
  mcqCount?: number;
  timeAllocationMinutes?: number;
  creditCost?: number;
}

// ── Start course generation — returns courseId immediately ───────────────────
export async function startCourseGeneration(
  topic: string,
  file?: File | null,
  level?: "beginner" | "intermediate" | "advanced" | null,
  tier?: string | null
): Promise<{ courseId: string; status: string }> {
  const formData = new FormData();
  if (topic) formData.append("topic", topic);
  if (file) formData.append("file", file);
  if (level) formData.append("level", level);
  if (tier) formData.append("tier", tier);

  const res = await fetch(`${BASE_URL}/api/course/generate`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: formData,
  });
  handleUnauthorized(res);
  if (!res.ok) {
    // Attach status/code so callers (e.g. AiTutor.tsx's runGeneration) can
    // tell a 402 "no_credits"/"invalid_tier" apart from a generic failure
    // instead of showing the same alert for both.
    const data = await res.json().catch(() => ({} as any));
    const err = new Error(data.message || data.error || "Failed to start course generation") as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return res.json();
}

// ── Course tiers + credit packs (admin-adjustable, not hardcoded) ────────────
export interface CourseTier {
  key: string;
  name: string;
  description: string;
  lessonCount: number;
  mcqCount: number;
  timeAllocationMinutes: number;
  creditCost: number;
}

export interface CreditPack {
  key: string;
  credits: number;
  priceCents: number;
  badge: string | null;
}

export async function getPricingConfig(): Promise<{ courseTiers: CourseTier[]; creditPacks: CreditPack[] }> {
  const res = await fetch(`${BASE_URL}/api/payment/pricing-config`);
  if (!res.ok) throw new Error("Failed to load pricing config");
  return res.json();
}

// ── Admin — course tiers + credit packs (requireAdmin-gated server-side) ─────
export async function getAdminPricingConfig(): Promise<{ courseTiers: CourseTier[]; creditPacks: CreditPack[] }> {
  const res = await fetch(`${BASE_URL}/api/admin/pricing-config`, { headers: { ...authHeaders() } });
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load pricing config");
  return res.json();
}

export async function updateAdminPricingConfig(
  courseTiers: CourseTier[],
  creditPacks: CreditPack[]
): Promise<{ courseTiers: CourseTier[]; creditPacks: CreditPack[] }> {
  const res = await fetch(`${BASE_URL}/api/admin/pricing-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ courseTiers, creditPacks }),
  });
  handleUnauthorized(res);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save pricing config");
  }
  return res.json();
}

// ── Credits dashboard ─────────────────────────────────────────────────────────
export interface CreditsBalance {
  courseCredits: number;
  freeTrialUsed: boolean;
  canGenerate: boolean;
  spendableBalance: number;
  signupBonusCredits: number;
  signupBonusExpiresAt: string | null;
}

export async function getCreditsBalance(): Promise<CreditsBalance> {
  const res = await fetch(`${BASE_URL}/api/payment/credits`, { headers: { ...authHeaders() } });
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Failed to fetch credits");
  return res.json();
}

export interface CreditTransactionEntry {
  _id: string;
  amount: number;
  balanceAfter: number;
  source: "signup_bonus" | "referral" | "purchase" | "course_generation" | "refund" | "feedback";
  meta?: Record<string, unknown>;
  createdAt: string;
}

export async function getTransactions(before?: string | null): Promise<{
  transactions: CreditTransactionEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const url = new URL(`${BASE_URL}/api/payment/transactions`);
  if (before) url.searchParams.set("before", before);
  const res = await fetch(url.toString(), { headers: { ...authHeaders() } });
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Failed to load transaction history");
  return res.json();
}

// ── Poll a course's status once ──────────────────────────────────────────────
export async function getCourseStatus(courseId: string): Promise<CourseFromAPI> {
  const res = await fetch(`${BASE_URL}/api/course/status/${courseId}`, {
    headers: { ...authHeaders() },
  });
  handleUnauthorized(res);
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
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Failed to list courses");
  return res.json();
}

// ── Delete a course ──────────────────────────────────────────────────────────
export async function deleteCourse(courseId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Failed to delete course");
}

// ── Retry a failed/broken lesson (rebuilds scene + audio + code) ─────────────
export async function retryLesson(courseId: string, lessonIndex: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/retry/${lessonIndex}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  handleUnauthorized(res);
  if (!res.ok) throw new Error("Failed to retry lesson");
}

// ── Fix just the ONE scene (or the shared header) that crashed, not the
// whole lesson ───────────────────────────────────────────────────────────
// Synchronous (unlike retryLesson's fire-and-forget-then-poll) — one patch is
// a single small LLM call, fast enough to just await. `target` tells you
// which: "scene" for a single scene's own code, "header" for the shared
// imports/constants/components every scene in the lesson calls into (a bug
// there can't be fixed by touching any one scene, since the bug isn't in
// it). Throws a RetrySceneError with `fallbackToFullRetry: true` when the
// backend couldn't confidently isolate either (e.g. an old lesson generated
// before scene boundaries were tracked) — the caller should fall back to
// retryLesson.
export class RetrySceneError extends Error {
  fallbackToFullRetry: boolean;
  constructor(message: string, fallbackToFullRetry: boolean) {
    super(message);
    this.fallbackToFullRetry = fallbackToFullRetry;
  }
}

export async function retryScene(
  courseId: string,
  lessonIndex: number,
  info: { crashFrame: number | null; errorMessage: string }
): Promise<
  | { target: "scene"; sceneNumber: number; code: string }
  | { target: "header"; code: string }
> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/retry-scene/${lessonIndex}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(info),
  });
  handleUnauthorized(res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RetrySceneError(data.error || "Failed to patch lesson", Boolean(data.fallbackToFullRetry));
  }
  return data;
}

// ── Unlock the rest of a free-trial course (costs 1 credit) ─────────────────
// Throws an error with a "no_credits" message if the user doesn't have a
// credit available — the caller should catch this and prompt them to buy one.
export async function unlockCourse(courseId: string): Promise<{ ok: true; message: string }> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/unlock`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  handleUnauthorized(res);
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
  handleUnauthorized(res);
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
  handleUnauthorized(res);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to publish course");
  return data;
}

export async function unpublishCourse(courseId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/course/${courseId}/publish`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  handleUnauthorized(res);
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