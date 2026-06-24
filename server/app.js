const express = require('express');
const cors = require('cors');
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
    ? ["https://levelup-snowy.vercel.app"]
    : true,
  credentials: true,
}));

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
// app.use('/api', checkoutRouter);

// Serve audio files for browser playback at /audio/*
// The browser fetches these directly during Remotion Player playback.
app.use(
  "/audio",
  express.static(
    process.env.NODE_ENV === "production"
      ? "/data/audio"
      : path.resolve(__dirname, "../remotion-render/public/audio")
  )
);

app.get('/sitemap.xml', async (req, res) => {
  try {
    const smStream = new SitemapStream({
      hostname: 'https://levelup-snowy.vercel.app'
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
Sitemap: https://level-up-nnee.onrender.com/sitemap.xml`
  );
});

module.exports = app;