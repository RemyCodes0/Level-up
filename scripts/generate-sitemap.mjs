// scripts/generate-sitemap.mjs
//
// Bakes published courses into public/sitemap.xml at BUILD TIME, before
// `vite build` copies public/ into the deployed output. Why build-time
// instead of a live server route: the frontend (leveluppedu.app) and the
// API server are separate origins, and there's no proxy from the frontend
// domain to the API for /sitemap.xml — a crawler requesting
// https://leveluppedu.app/sitemap.xml only ever sees this static file.
// Generating it here, once per deploy, gets real dynamic URLs (published
// courses) in front of crawlers without needing a serverless function or
// reverse proxy.
//
// MUST NEVER FAIL THE BUILD: if the API is unreachable or errors, this falls
// back to the static marketing routes alone and exits 0 — a stale-but-valid
// sitemap (or one missing dynamic entries) is far better than a broken
// deploy. Wired up as `prebuild` in package.json, which npm runs
// automatically before `npm run build`.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "public", "sitemap.xml");
const SITE = "https://leveluppedu.app";
const API = process.env.VITE_API_URL || "https://level-up-nnee.onrender.com";
const TODAY = new Date().toISOString().slice(0, 10);

// Always-present marketing/static routes — the source of truth for these
// lives here now (not hand-duplicated in public/sitemap.xml directly), so
// there's one place to add a new static page to the sitemap.
const STATIC_ROUTES = [
  { url: "/", changefreq: "weekly", priority: 1.0 },
  { url: "/price", changefreq: "monthly", priority: 0.8 },
  { url: "/gallery", changefreq: "daily", priority: 0.8 },
  { url: "/ai_showcase", changefreq: "weekly", priority: 0.7 },
  { url: "/signup", changefreq: "monthly", priority: 0.7 },
  { url: "/login", changefreq: "monthly", priority: 0.4 },
  { url: "/terms.html", changefreq: "yearly", priority: 0.3 },
  { url: "/privacy-policy.html", changefreq: "yearly", priority: 0.3 },
  { url: "/refund-policy.html", changefreq: "yearly", priority: 0.3 },
  // /ai_tutor is intentionally excluded — auth-gated and noindex/nofollow
  // in its own Helmet block; listing it here would contradict that signal.
];

// Bounded, defensive fetch — a timeout so a hanging API never hangs the build.
async function safeFetchJson(url, { timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Published courses are cursor-paginated (see courseController.listPublicCoursesHandler)
// — walk a bounded number of pages so a very large gallery can't make the
// build hang or produce an unreasonably huge sitemap.
async function fetchPublishedCourseUrls({ maxPages = 20, pageSize = 50 } = {}) {
  const urls = [];
  let cursor = null;
  try {
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) params.set("cursor", cursor);
      const data = await safeFetchJson(`${API}/api/course/public?${params.toString()}`);
      for (const c of data.courses || []) {
        if (c.shareUrl) urls.push({ url: c.shareUrl, changefreq: "monthly", priority: 0.5 });
      }
      if (!data.nextCursor) break;
      cursor = data.nextCursor;
    }
  } catch (err) {
    console.warn("[sitemap] Stopping published-course URLs early — fetch failed:", err.message);
  }
  return urls;
}

function buildXml(entries) {
  const urlTags = entries
    .map(
      (e) => `  <url>
    <loc>${SITE}${e.url}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority.toFixed(1)}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlTags}\n</urlset>\n`;
}

async function main() {
  let dynamicUrls = [];
  try {
    dynamicUrls = await fetchPublishedCourseUrls();
  } catch (err) {
    // Belt-and-suspenders: fetchPublishedCourseUrls already catches its own
    // errors, but if something else goes wrong here, fall back to
    // static-only rather than letting the build fail.
    console.warn("[sitemap] Falling back to static routes only:", err.message);
  }

  const xml = buildXml([...STATIC_ROUTES, ...dynamicUrls]);
  writeFileSync(OUT_PATH, xml, "utf8");
  console.log(`[sitemap] Wrote ${STATIC_ROUTES.length + dynamicUrls.length} URLs (${dynamicUrls.length} dynamic) to ${OUT_PATH}`);
}

main().catch((err) => {
  // Never fail the build over a sitemap. Leave whatever public/sitemap.xml
  // already exists (committed fallback) untouched and exit success.
  console.warn("[sitemap] Generation failed entirely, leaving existing public/sitemap.xml as-is:", err.message);
  process.exit(0);
});
