const express = require('express');
const cors = require('cors');

const { SitemapStream, streamToPromise } = require('sitemap');

const authRoutes = require('./routes/auth');
const tutorRoutes = require('./routes/tutor');
const bookRoutes = require("./routes/book");
const reviewRoutes = require("./routes/review");

const Tutor = require('./models/Tutor');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/tutor', tutorRoutes);
app.use('/api/book/', bookRoutes);
app.use('/api/reviews', reviewRoutes);

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
// Robots.txt
Sitemap: https://level-up-nnee.onrender.com/sitemap.xml`
  );
}); 

module.exports = app;