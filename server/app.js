const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require("path");

const { SitemapStream, streamToPromise } = require('sitemap');

const authRoutes = require('./routes/auth');
const tutorRoutes = require('./routes/tutor');
const bookRoutes = require("./routes/book");
const reviewRoutes = require("./routes/review");
const courseRoutes = require('./routes/course');
const paymentRoutes = require('./routes/payment');
const feedbackRoutes = require('./routes/feedback')
const exportRoutes = require('./routes/export')
const checkoutRouter = require('./routes/checkout.js');

const Tutor = require('./models/Tutor');

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? ["https://levelup-snowy.vercel.app", "https://leveluppedu.app"]
    : true,
  credentials: true,
}));

// gzip/brotli every JSON/text response — cheap CPU cost, meaningfully cuts
// bandwidth and time-to-first-byte for course/booking/tutor list payloads.
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

app.use('/api/auth', authRoutes);
app.use('/api/tutor', tutorRoutes);
app.use('/api/book/', bookRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/course', courseRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/export', exportRoutes)
app.use('/api/assessment', require('./routes/assessment'))
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/email', require('./routes/adminEmail'));
app.use('/api/ads', require('./routes/ads'));
app.use('/api/email', require('./routes/email'));
app.use('/api/showcase', require('./routes/showcase'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/referral', require('./routes/referral'))
app.use('/api/collab', require('./routes/collab'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/track', require('./routes/track'));
// app.use('/api', checkoutRouter);

// Serve audio files for browser playback at /audio/*
// The browser fetches these directly during Remotion Player playback.
const audioDir = process.env.NODE_ENV === "production"
  ? "/data/audio"
  : path.resolve(__dirname, "../remotion-render/public/audio");

app.use("/audio", express.static(audioDir));

// Uploaded brand assets for ads (logos, screenshots). Same disk pattern as audio.
const uploadsDir = process.env.NODE_ENV === "production"
  ? "/data/uploads"
  : path.resolve(__dirname, "../remotion-render/public/uploads");
app.use("/uploads", (req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  if (origin) res.setHeader("Vary", "Origin");
  next();
});
app.use("/uploads", express.static(uploadsDir));

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
// but the dynamic tutor/course entries it lists are why scripts/generate-sitemap.mjs
// exists: it bakes the same dynamic data into the static file at build time,
// which crawlers actually reach.
app.get('/sitemap.xml', async (req, res) => {
  try {
    const smStream = new SitemapStream({
      hostname: 'https://leveluppedu.app'
    });

    smStream.write({ url: '/', changefreq: 'daily', priority: 1.0 });
    smStream.write({ url: '/tutors', changefreq: 'daily', priority: 0.9 });
    smStream.write({ url: '/apply', changefreq: 'monthly', priority: 0.6 });

    const tutors = await Tutor.find({}, '_id');
    tutors.forEach(t => {
      smStream.write({
        url: `/tutors/${t._id}`,
        changefreq: 'weekly',
        priority: 0.7
      });
    });

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