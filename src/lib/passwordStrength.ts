// lib/passwordStrength.ts
//
// Mirrors server/utils/passwordStrength.js exactly — this is what drives the
// strength meter the user sees while typing, and it must agree with what the
// API will actually accept. Keep the two in sync if either changes.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_ACCEPTABLE_SCORE = 2;

export interface PasswordChecks {
  minLength: boolean;
  longLength: boolean;
  mixedCase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

export type PasswordStrengthLabel = "Very weak" | "Weak" | "Fair" | "Good" | "Strong";

const LABELS: PasswordStrengthLabel[] = ["Very weak", "Weak", "Fair", "Good", "Strong"];

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    longLength: password.length >= 12,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function scorePassword(password: string): number {
  const checks = getPasswordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  return Math.min(score, 4);
}

export function getPasswordStrengthLabel(score: number): PasswordStrengthLabel {
  return LABELS[Math.max(0, Math.min(score, 4))];
}

// What the signup/reset-password forms gate submission on — must match
// MIN_ACCEPTABLE_SCORE + MIN_LENGTH server-side.
export function isPasswordAcceptable(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && scorePassword(password) >= PASSWORD_MIN_ACCEPTABLE_SCORE;
}
