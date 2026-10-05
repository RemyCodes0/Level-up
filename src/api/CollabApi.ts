const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface CollabRoomSummary {
  _id: string;
  name: string;
  visibility: "public" | "invite-only";
  inviteCode: string;
  completionThreshold: number;
  remedialTriggered: boolean;
  status: "active" | "archived";
  courseId: { _id: string; topic: string; status: string };
  participants: { userId: { _id: string; name: string } | string; joinedAt: string }[];
  createdAt: string;
}

export async function createCollabRoom(
  topic: string,
  file: File | null | undefined,
  opts: { name?: string; visibility: "public" | "invite-only"; completionThreshold: number; level?: string | null; tier: string }
): Promise<{ roomId: string; courseId: string; inviteCode: string; joinUrl: string }> {
  const formData = new FormData();
  if (topic) formData.append("topic", topic);
  if (file) formData.append("file", file);
  if (opts.name) formData.append("name", opts.name);
  formData.append("visibility", opts.visibility);
  formData.append("completionThreshold", String(opts.completionThreshold));
  if (opts.level) formData.append("level", opts.level);
  // checkCredits (routes/collab.js) reads this exactly like the solo
  // /generate route does — see its own comment for the tier vs. legacy
  // split. Required now: collabController.createRoom reads
  // req.courseTierSnapshot unconditionally.
  formData.append("tier", opts.tier);

  const res = await fetch(`${BASE_URL}/api/collab/rooms`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create study group");
  return data;
}

export async function listMyRooms(): Promise<CollabRoomSummary[]> {
  const res = await fetch(`${BASE_URL}/api/collab/rooms/mine`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to load your study groups");
  return res.json();
}

export async function getRoom(roomId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/collab/rooms/${roomId}`, { headers: { ...authHeaders() } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load study group");
  return data;
}

export async function joinRoomById(roomId: string): Promise<{ roomId: string; courseId: string }> {
  const res = await fetch(`${BASE_URL}/api/collab/rooms/${roomId}/join`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to join study group");
  return data;
}

export async function joinRoomByCode(inviteCode: string): Promise<{ roomId: string; courseId: string }> {
  const res = await fetch(`${BASE_URL}/api/collab/join/${encodeURIComponent(inviteCode.trim().toUpperCase())}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Invalid invite code");
  return data;
}

export interface RoomInvitePreview {
  roomId: string;
  name: string;
  topic: string;
  visibility: "public" | "invite-only";
  memberCount: number;
}

// Public — no auth — a preview before committing to join.
export async function previewRoomByLink(shareToken: string): Promise<RoomInvitePreview> {
  const res = await fetch(`${BASE_URL}/api/collab/join/link/${shareToken}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Invalid or expired invite link");
  return data;
}

export async function joinRoomByLink(shareToken: string): Promise<{ roomId: string; courseId: string }> {
  const res = await fetch(`${BASE_URL}/api/collab/join/link/${shareToken}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to join study group");
  return data;
}

export interface DashboardMember {
  userId: string;
  name: string;
  lessonsWatched: number;
  totalLessons: number;
  watchPct: number;
  quizPct: number | null;
  quizSubmitted: boolean;
  completed: boolean;
}

export interface DashboardTopic {
  topic: string;
  avgPct: number;
  respondents: number;
}

export interface DashboardReplayEntry {
  lessonNumber: number;
  title?: string;
  replayCount: number;
}

export interface DashboardReplayScene extends DashboardReplayEntry {
  sceneIndex: number;
  lessonTitle?: string;
  sceneLabel?: string;
}

export interface RoomDashboard {
  room: { _id: string; name: string; completionThreshold: number; remedialTriggered: boolean };
  course: { topic: string; status: string; totalLessons: number };
  members: DashboardMember[];
  groupTopics: DashboardTopic[];
  mostReplayedLessons: DashboardReplayEntry[];
  mostReplayedScenes: DashboardReplayScene[];
}

export async function getDashboard(roomId: string): Promise<RoomDashboard> {
  const res = await fetch(`${BASE_URL}/api/collab/rooms/${roomId}/dashboard`, { headers: { ...authHeaders() } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}
