// utils/passwordStrength.js
//
// Single source of truth for "is this password strong enough" on the
// server side. The frontend (src/lib/passwordStrength.ts) mirrors this
// scoring exactly so the strength meter a user sees while typing matches
// what the API will actually accept — keep the two in sync if either
// changes. No external dependency (no zxcvbn): the rules are simple enough
// that a small regex-based scorer is both sufficient and one less package
// to install on a memory-constrained host.
//
// Score is 0-4:
//   0-1 = too weak, rejected
//   2   = minimum accepted ("Fair")
//   3   = "Good"
//   4   = "Strong"

const MIN_LENGTH = 8;
const MIN_ACCEPTABLE_SCORE = 2;

function scorePassword(password) {
  const pw = String(password || "");
  let score = 0;
  if (pw.length >= MIN_LENGTH) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

// Returns null if the password is acceptable, or a user-facing error
// message if it isn't — callers just check `if (msg) return res.status(400)...`.
function validatePasswordStrength(password) {
  const pw = String(password || "");
  if (pw.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters long.`;
  }
  if (scorePassword(pw) < MIN_ACCEPTABLE_SCORE) {
    return "Password is too weak. Mix in uppercase, numbers, or symbols.";
  }
  return null;
}

module.exports = { scorePassword, validatePasswordStrength, MIN_LENGTH, MIN_ACCEPTABLE_SCORE };
