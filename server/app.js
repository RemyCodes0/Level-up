const express = require('express')
const cors = require('cors')
const authRoutes = require('./routes/auth')
const tutorRoutes = require('./routes/tutor')
const bookRoutes = require("./routes/book")
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/tutor', tutorRoutes);
app.use('/api/book/', bookRoutes)

module.exports = app; 