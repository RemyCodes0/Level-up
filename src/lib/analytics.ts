import posthog from "posthog-js";

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (PostHog)
//
// One place for all product analytics. The heavy lifting is done by AUTOCAPTURE:
// once initAnalytics() runs, PostHog automatically records clicks, form
// submissions, input changes, rage clicks, and more — for every visitor,
// including anonymous ones — with zero per-element instrumentation. We add on
// top of that: SPA pageviews (this app uses client-side routing), session
// replay, identify()/reset() around auth, and a set of named domain events for
// the moments autocapture can't infer (a course finished generating, a lesson
// failed to render, credits purchased, etc).
//
// Setup: add these to your .env (get the key from your PostHog project settings):
//   VITE_PUBLIC_POSTHOG_KEY=phc_xxx
//   VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   (or https://eu.i.posthog.com)
// If the key is absent, analytics silently no-ops so the app still runs.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ||
  "https://us.i.posthog.com";

let started = false;

export function initAnalytics(): void {
  if (started) return;
  if (!KEY) {
    console.warn("[analytics] VITE_PUBLIC_POSTHOG_KEY not set — analytics disabled.");
    return;
  }
  started = true;

  posthog.init(KEY, {
    api_host: HOST,

    // Start OPTED-OUT: nothing is captured and no tracking cookies are set until
    // the visitor accepts via the cookie banner (see CookieConsent). A returning
    // visitor's earlier choice is remembered by PostHog, so the banner only
    // shows until they decide once.
    opt_out_capturing_by_default: true,

    // Record clicks / inputs / submits / navigations automatically. This is the
    // bulk of "know everything anonymous people do" with no manual tagging.
    autocapture: true,

    // SPA pageviews: PostHog's recommended mode for single-page apps. It
    // captures a $pageview automatically on every History API navigation (which
    // is how React Router moves between routes) AND on first load — so we don't
    // need a manual route-tracker component, and PostHog's own pageview
    // detection recognizes it.
    capture_pageview: "history_change",
    capture_pageleave: true, // gives time-on-page and bounce

    // Session replay — watch real sessions (anonymous included). Genuinely useful
    // for seeing the animation glitches users hit. Free tier: 5,000 replays/mo.
    // NOTE: you must ALSO turn on "Record user sessions" in your PostHog project
    // settings for this to take effect.
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: false,                    // keep most inputs visible for context…
      maskInputOptions: { password: true },    // …but never capture password fields
    },

    // Core Web Vitals + basic network performance.
    capture_performance: true,

    persistence: "localStorage+cookie",

    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug(false); // flip to true to see events in console
    },
  });

  // If a logged-in user is already stored (returning visit), re-identify them so
  // this session isn't miscounted as anonymous.
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u && (u._id || u.id || u.email)) identifyUser(u);
    }
  } catch {
    /* ignore malformed storage */
  }
}

type AppUser = { _id?: string; id?: string; name?: string; email?: string; role?: string };

/** Link the current (previously anonymous) session to a real account. */
export function identifyUser(user: AppUser): void {
  if (!started) return;
  const id = user._id || user.id || user.email;
  if (!id) return;
  posthog.identify(String(id), {
    email: user.email,
    name: user.name,
    role: user.role,
  });
}

/** Clear identity on logout so the next person on this device is separate. */
export function resetUser(): void {
  if (!started) return;
  posthog.reset();
}

/** Generic escape hatch for one-off events. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!started) return;
  posthog.capture(event, props);
}

// ── Cookie consent ───────────────────────────────────────────────────────────
// PostHog boots opted-out (opt_out_capturing_by_default above), so the banner
// gates all capturing and cookies. Returning visitors' choices are remembered
// by PostHog, so the banner only shows until they've decided once.

/** True once the visitor has explicitly accepted OR declined (so hide banner).
 *  Also true when analytics is disabled entirely (no key) — nothing to consent to. */
export function analyticsDecisionMade(): boolean {
  if (!started) return true;
  return posthog.has_opted_in_capturing() || posthog.has_opted_out_capturing();
}

/** Accept: start capturing and allow cookies. */
export function acceptAnalytics(): void {
  if (!started) return;
  posthog.opt_in_capturing();
}

/** Decline: stay off, set no tracking cookies. */
export function declineAnalytics(): void {
  if (!started) return;
  posthog.opt_out_capturing();
}

// ── Named domain events ──────────────────────────────────────────────────────
// Call these from the relevant handlers. Keeping them here means event names
// stay consistent (no typos scattered across the app) and are easy to audit.
export const analytics = {
  signedUp: (p?: Record<string, unknown>) => track("user_signed_up", p),
  loggedIn: (p?: Record<string, unknown>) => track("user_logged_in", p),
  loggedOut: () => track("user_logged_out"),
  emailVerified: () => track("email_verified"),

  courseStarted: (p?: { topic?: string; source?: "topic" | "pdf" }) =>
    track("course_generation_started", p),
  courseCompleted: (p?: Record<string, unknown>) => track("course_completed", p),
  lessonViewed: (p?: { lesson?: number }) => track("lesson_viewed", p),
  lessonRenderFailed: (p?: Record<string, unknown>) => track("lesson_render_failed", p),
  lessonRegenerated: (p?: { lesson?: number }) => track("lesson_regenerated", p),

  courseShared: (p?: Record<string, unknown>) => track("course_shared", p),
  referralLinkCopied: () => track("referral_link_copied"),
  pdfUploaded: () => track("pdf_uploaded"),
  pricingViewed: () => track("pricing_viewed"),
  creditsPurchased: (p?: { amount?: number; credits?: number }) =>
    track("credits_purchased", p),
};