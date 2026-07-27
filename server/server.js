require('dotenv').config()

// This host has no outbound IPv6 route, but api.z.ai's DNS returns 6 IPv6
// addresses alongside 1 IPv4 one — Node's fetch (undici) was trying all 6
// IPv6 addresses first, failing each with ENETUNREACH, before falling
// through to the working IPv4 address (sometimes not before the whole
// attempt gave up and threw). Forcing IPv4-first here skips the doomed IPv6
// attempts entirely. Must run before anything makes an outbound request.
require('dns').setDefaultResultOrder('ipv4first');

const app = require('./app')
const connectDB = require('./config/db')


connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=>console.log(`Server is running on port: ${PORT}✨`))