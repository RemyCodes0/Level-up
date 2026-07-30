// Shared fetch helper for every admin page. One place for the base URL,
// auth header, and 401/403 handling instead of each page reimplementing it
// (the old /ai_admin and /admin pages each did this slightly differently —
// some plain fetch, some axios, some with no auth header at all).
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401) throw new AdminApiError("Not logged in.", 401);
  if (res.status === 403) throw new AdminApiError("You don't have admin access.", 403);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(body.error || body.message || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const adminApi = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { BASE_URL };
