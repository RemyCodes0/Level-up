// Shared between Users.tsx and UserProfile.tsx — split out of Users.tsx
// because co-exporting a plain function/type alongside a default component
// export breaks Vite's fast-refresh boundary (react-refresh/only-export-components).

export interface User {
  _id: string;
  name: string;
  email: string;
  verified: boolean;
  courseCredits: number;
  signupBonusCredits?: number;
  signupBonusExpiresAt?: string | null;
  createdAt: string;
  // Added alongside this richer view — see authController.js's getUsers.
  authProvider?: "local" | "google";
  freeTrialUsed?: boolean;
  referralCount?: number;
  referralCreditsEarned?: number;
  emailUnsubscribed?: boolean;
  // Aggregated server-side from the Course collection, not stored on the
  // user document itself — real counts, not an estimate.
  courseCount?: number;
}

// Mirrors creditService.js's getSpendableBalance — the signup bonus only
// counts while unexpired. Admins should see (and adjust against) the same
// number the user's own dashboard shows, not the raw courseCredits field
// alone, which was the old behavior here and undercounted anyone still
// sitting on signup-bonus credits.
export function spendableBalance(u: User): number {
  const bonusValid = !!u.signupBonusExpiresAt && new Date(u.signupBonusExpiresAt).getTime() > Date.now();
  return (bonusValid ? u.signupBonusCredits || 0 : 0) + (u.courseCredits || 0);
}
