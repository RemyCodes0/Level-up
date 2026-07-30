// middleware/requireAdmin.js
//
// Runs AFTER the normal `protect` middleware (which sets req.user). It then
// checks whether that authenticated user is YOU — the admin — by comparing
// against a hardcoded admin identifier. Everyone else gets a 403.
//
// Set ADMIN_EMAIL in your .env to your own account's email. Using an env var
// (rather than literally hardcoding it in the file) keeps your email out of
// the source code and lets you change it without a code edit.

// Shared by the middleware below AND any controller that needs an inline
// "is this user the admin, or are they acting on their own record" check
// (e.g. authController's getUser/updateUser) without duplicating the
// ADMIN_EMAIL comparison logic in two places.
function isAdminUser(user) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  if (!adminEmail) return false; // fail closed, same as the middleware below
  return (user?.email || "").toLowerCase().trim() === adminEmail;
}
exports.isAdminUser = isAdminUser;

exports.requireAdmin = (req, res, next) => {
  // protect must run before this and set req.user.
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!(process.env.ADMIN_EMAIL || "").trim()) {
    console.warn("requireAdmin: ADMIN_EMAIL is not set — denying all admin access.");
    return res.status(403).json({ error: "Admin access not configured" });
  }

  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
};