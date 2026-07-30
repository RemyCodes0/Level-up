// First-party page-view tracking — posts to this app's own backend
// (server/routes/track.js -> PageView model) so visit data lives in our own
// MongoDB and shows up in the admin Traffic page, instead of only existing
// in PostHog/GA's external dashboards. Called alongside the existing GA
// `pageview()` call on every route change (see Analytics.tsx) — same
// trigger point, no new listener.
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const SESSION_KEY = "levelup_pv_session";

// One anonymous id per browser, generated once and reused — lets the admin
// dashboard count unique visitors without any personally-identifying data.
function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function trackPageView(path: string) {
  const token = localStorage.getItem("token");
  fetch(`${BASE_URL}/api/track/pageview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      path,
      referrer: document.referrer || "",
      sessionId: getSessionId(),
    }),
    // Never let a tracking failure surface to the user or block navigation.
  }).catch(() => {});
}
