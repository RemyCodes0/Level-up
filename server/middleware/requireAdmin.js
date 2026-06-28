// middleware/requireAdmin.js
//
// Runs AFTER the normal `protect` middleware (which sets req.user). It then
// checks whether that authenticated user is YOU — the admin — by comparing
// against a hardcoded admin identifier. Everyone else gets a 403.
//
// Set ADMIN_EMAIL in your .env to your own account's email. Using an env var
// (rather than literally hardcoding it in the file) keeps your email out of
// the source code and lets you change it without a code edit.

exports.requireAdmin = (req, res, next) => {
  // protect must run before this and set req.user.
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

  // Fail closed: if no admin email is configured, nobody is admin.
  if (!adminEmail) {
    console.warn("requireAdmin: ADMIN_EMAIL is not set — denying all admin access.");
    return res.status(403).json({ error: "Admin access not configured" });
  }

  if ((req.user.email || "").toLowerCase().trim() !== adminEmail) {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
};