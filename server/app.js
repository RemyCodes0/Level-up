const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require("path");

const { SitemapStream, streamToPromise } = require('sitemap');

const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/course');
const paymentRoutes = require('./routes/payment');
const feedbackRoutes = require('./routes/feedback')

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? ["https://levelup-snowy.vercel.app", "https://leveluppedu.app"]
    : true,
  credentials: true,
}));

// gzip/brotli every JSON/text response — cheap CPU cost, meaningfully cuts
// bandwidth and time-to-first-byte for course list payloads.
app.use(compression());

// ──────────────────────────────────────────────────────────────────────────
// IMPORTANT: paymentRoutes is mounted BEFORE express.json().
// It contains the Whop webhook endpoint, which uses express.raw() internally
// to get the untouched request body for signature verification. If
// express.json() ran first (as it did before this fix), it would consume
// and parse the body for every route — including this one — leaving
// express.raw() with nothing to read and causing webhook signature
// verification to fail with "No matching signature found".
//
// Every other router below still gets JSON parsing normally, since
// express.json() is registered right after this line and applies globally
// to all routes that haven't already consumed the body.
// ──────────────────────────────────────────────────────────────────────────
app.use('/api/payment', paymentRoutes);

app.use(express.json());

// ──────────────────────────────────────────────────────────────────────────
// Maintenance mode gate — blocks non-exempt traffic with a 503 when an admin
// has flipped the toggle on the Overview page. This is DEFENSE IN DEPTH
// alongside the frontend's own gate (App.tsx) — it protects "activities" even
// if something calls the API directly instead of going through the app.
//
// Exempt prefixes:
//   /api/admin      — an admin must always be able to manage the site,
//                      including turning maintenance mode back OFF.
//   /api/auth       — login must keep working, or an admin who isn't
//                      currently logged in could lock themselves out.
//   /api/maintenance — the status check itself (frontend polls this to know
//                      whether to show the maintenance page at all).
//   /audio            — static asset serving, not "activity"; blocking it
//                      would just break already-loaded playback for no
//                      benefit (this is registered further down, but the
//                      prefix is listed here for one central allowlist).
//
// Payment webhooks (paymentRoutes, mounted above at line 46, before
// express.json()) are NOT behind this gate at all — they run earlier in the
// middleware chain, which is deliberate: an external payment provider's
// webhook must always be processed, maintenance mode or not, or a customer
// could pay and never get credited.
const MAINTENANCE_EXEMPT_PREFIXES = ["/api/admin", "/api/auth", "/api/maintenance", "/audio"];
app.use(async (req, res, next) => {
  if (MAINTENANCE_EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  try {
    const { getMaintenanceConfig } = require("./services/maintenanceConfigService");
    const config = await getMaintenanceConfig();
    if (config.active) {
      return res.status(503).json({ error: "maintenance", message: config.message });
    }
  } catch (err) {
    // Fail OPEN — a broken maintenance check must never itself take the site
    // down.
    console.error("[maintenance] gate check failed, allowing request through:", err.message);
  }
  next();
});

app.use('/api/maintenance', require('./routes/maintenance'));

app.use('/api/auth', authRoutes);
app.use('/api/course', courseRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/assessment', require('./routes/assessment'))
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/email', require('./routes/adminEmail'));
app.use('/api/email', require('./routes/email'));
app.use('/api/showcase', require('./routes/showcase'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/referral', require('./routes/referral'))
app.use('/api/collab', require('./routes/collab'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/track', require('./routes/track'));

// Serve audio files for browser playback at /audio/*
// The browser fetches these directly during Remotion Player playback.
const audioDir = process.env.NODE_ENV === "production"
  ? "/data/audio"
  : path.resolve(__dirname, "../remotion-render/public/audio");

// maxAge/immutable (not bare express.static): without them Cache-Control is
// `public, max-age=0`, so the browser REVALIDATES every narration file on every
// request — a conditional-GET round-trip that lands right at each scene
// boundary, which is exactly when Remotion pauses the whole composition waiting
// on a buffering <Audio> (BufferedAudio sets pauseWhenBuffering, see
// useCompilation.ts). Those pauses freeze picture and sound together and read
// as judder/low-fps even though no frame was dropped. Safe to cache forever
// here because these names are never reused: ttsService.js writes every clip as
// a fresh `${uuidv4()}.wav`, so regenerating a lesson produces NEW filenames
// rather than new bytes under an old one. Also makes DynamicPlayer's existing
// preload="auto" prefetch actually pay off, since the prefetched bytes can now
// be served from cache instead of re-requested.
app.use("/audio", express.static(audioDir, { maxAge: "365d", immutable: true }));

// ──────────────────────────────────────────────────────────────────────────
// EXPLICIT 404 for missing audio files.
//
// Without this, a missing file falls through express.static's next() call
// into Express's own DEFAULT 404 handler — a generic, minimal HTML page
// with an ambiguous response shape. Native <audio> elements send Range
// requests (Range: bytes=0-) for progressive loading, and Chrome's media
// engine doesn't handle an unexpected HTML response to a Range request
// gracefully — instead of treating it as a clean permanent failure, it can
// retry the request internally at the browser's own network layer, bypassing
// any React/JS error handling entirely. This caused a real production
// incident: 20,000+ repeated requests to a single missing audio file in
// minutes, invisible to every application-level fix because the retries
// were happening below the JavaScript layer.
//
// Sending back a plain, unambiguous 404 with an empty body removes that
// ambiguity — Chrome sees a clean "not found" and stops trying.
app.use("/audio", (req, res) => {
  res.status(404).end();
});

// NOTE: this route is very likely unreachable by real crawlers. The frontend
// (leveluppedu.app) and this API server are separate origins — a request to
// https://leveluppedu.app/sitemap.xml is served by the STATIC public/sitemap.xml
// file in the frontend build, not by this Express route, since there's no
// proxy/rewrite from the frontend domain to this server for that path (see
// vercel.json — its only rule is the SPA catch-all rewrite to index.html,
// and Vercel serves an existing static file over a rewrite regardless). This
// route only actually serves a sitemap if something requests THIS server's
// own origin directly. Kept (and its hostname corrected) rather than removed,
// since deleting a live route on request is a bigger call than fixing one —
// but the dynamic course entries it lists are why scripts/generate-sitemap.mjs
// exists: it bakes the same dynamic data into the static file at build time,
// which crawlers actually reach.
app.get('/sitemap.xml', async (req, res) => {
  try {
    const smStream = new SitemapStream({
      hostname: 'https://leveluppedu.app'
    });

    smStream.write({ url: '/', changefreq: 'daily', priority: 1.0 });

    smStream.end();
    const data = await streamToPromise(smStream);
    res.header('Content-Type', 'application/xml');
    res.send(data.toString());
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(
`User-agent: *
Allow: /
Sitemap: https://leveluppedu.app/sitemap.xml`
  );
});

module.exports = app;