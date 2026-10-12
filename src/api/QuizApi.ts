const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface SubmittedAnswer {
  questionId: number;
  selected: number;
}

export interface TopicBreakdown {
  topic: string;
  correct: number;
  total: number;
  pct: number;
}

export interface MissedQuestion {
  questionId: number;
  question: string;
  topic: string;
  yourAnswer: string | null;
  correctAnswer: string;
}

export interface QuizTrend {
  previousPct: number;
  delta: number;
  attemptNumber: number;
  improvedTopics: string[];
  regressedTopics: string[];
}

export interface RoomComparison {
  roomAveragePct: number;
  aboveAverage: boolean;
  membersReporting: number;
}

export interface QuizResult {
  attemptId: string;
  score: number;
  total: number;
  pct: number;
  readinessLabel: string;
  topicBreakdown: TopicBreakdown[];
  missedQuestions: MissedQuestion[];
  trend: QuizTrend | null;
  roomComparison: RoomComparison | null;
}

// Server re-scores against the real answer key — the client only ever sends
// which option was picked, never a score, so nothing here can be forged.
export async function submitQuiz(courseId: string, answers: SubmittedAnswer[], roomId?: string): Promise<QuizResult> {
  const res = await fetch(`${BASE_URL}/api/quiz/${courseId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ answers, roomId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit quiz");
  return data;
}

export async function getLatestAttempt(courseId: string): Promise<QuizResult | null> {
  const res = await fetch(`${BASE_URL}/api/quiz/${courseId}/attempts/latest`, { headers: { ...authHeaders() } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load latest quiz attempt");
  return res.json();
}

// What GET /attempts actually returns: raw QuizAttempt docs, oldest first,
// with `answers` projected out. Deliberately NOT QuizResult — the list
// endpoint does no enrichment, so readinessLabel/missedQuestions/trend are
// absent there and only the single-attempt endpoints carry them.
export interface QuizAttemptSummary {
  _id: string;
  score: number;
  total: number;
  pct: number;
  topicBreakdown: TopicBreakdown[];
  submittedAt: string;
}

export async function getAttemptHistory(courseId: string): Promise<QuizAttemptSummary[]> {
  const res = await fetch(`${BASE_URL}/api/quiz/${courseId}/attempts`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to load quiz attempt history");
  return res.json();
}
