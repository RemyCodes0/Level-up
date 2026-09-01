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
let HOST =
  (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ||
  "https://us.i.posthog.com";

let started = false;

// ── Startup diagnostic ───────────────────────────────────────────────────────
// Prints ONE clear block to the browser console on every load saying exactly
// what's configured, what's wrong, and how to fix it. Analytics failures are
// otherwise silent (the app keeps working, events just never send), which makes
// them painful to debug — this makes the state impossible to miss.
function diagnose(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  if (!KEY) {
    problems.push(
      'VITE_PUBLIC_POSTHOG_KEY is MISSING.\n' +
      '   → Add it to your .env: VITE_PUBLIC_POSTHOG_KEY=phc_xxxxx\n' +
      '   → Get it from PostHog → Settings → Project → "Project API Key".\n' +
      '   → Then RESTART the dev server (Vite only reads .env at startup).'
    );
  } else if (KEY.startsWith("phx_")) {
    problems.push(
      `VITE_PUBLIC_POSTHOG_KEY is the WRONG KEY TYPE (starts with "phx_").\n` +
      '   → "phx_" is a PERSONAL API key (management API). It causes 401/404 errors.\n' +
      '   → You need the PROJECT API key, which starts with "phc_".\n' +
      '   → PostHog → Settings → Project → "Project API Key". Then restart the dev server.'
    );
  } else if (!KEY.startsWith("phc_")) {
    problems.push(
      `VITE_PUBLIC_POSTHOG_KEY doesn't look right (should start with "phc_").\n` +
      '   → Copy the "Project API Key" from PostHog → Settings → Project.'
    );
  }

  if (!/^https?:\/\//.test(HOST)) {
    problems.push(
      `VITE_PUBLIC_POSTHOG_HOST is not a valid URL (got: "${HOST}").\n` +
      '   → It must be an absolute URL: https://us.i.posthog.com (or https://eu.i.posthog.com).\n' +
      '   → It is NOT your own domain and NOT the API key.\n' +
      '   → Falling back to https://us.i.posthog.com for now.'
    );
    HOST = "https://us.i.posthog.com";
  }

  return { ok: problems.length === 0, problems };
}

function logDiagnostic(result: { ok: boolean; problems: string[] }) {
  const mask = (k?: string) => (k ? `${k.slice(0, 8)}…${k.slice(-4)} (${k.length} chars)` : "MISSING");

  if (result.ok) {
    console.log(
      "%c[analytics] PostHog configured ✅",
      "color:#22c55e;font-weight:bold",
      `\n  key:  ${mask(KEY)}\n  host: ${HOST}\n  Note: capturing starts only AFTER you click "Accept" on the cookie banner.`
    );
    return;
  }

  console.group("%c[analytics] PostHog is NOT working ❌", "color:#ef4444;font-weight:bold;font-size:13px");
  console.log("Current values:");
  console.log("  VITE_PUBLIC_POSTHOG_KEY :", mask(KEY));
  console.log("  VITE_PUBLIC_POSTHOG_HOST:", HOST || "MISSING");
  console.log("\nProblem(s) found:");
  result.problems.forEach((p, i) => console.log(`\n${i + 1}. ${p}`));
  console.log(
    "\nAlso note: the cookie banner is HIDDEN when analytics can't start.\n" +
    "Fix the above, restart the dev server, and open an incognito window — the banner will appear."
  );
  console.groupEnd();
}

export function initAnalytics(): void {
  if (started) return;

  const result = diagnose();
  logDiagnostic(result);

  // Without a usable key we cannot init — bail (app still runs, analytics off).
  if (!KEY) return;

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
      if (import.meta.env.DEV) {
        ph.debug(false); // flip to true to see every event in the console

        // Expose PostHog on window in DEV ONLY so you can debug from the browser
        // console — e.g. posthog.clear_opt_in_out_capturing() to re-show the
        // cookie banner, or posthog.debug() to log events. It's an ES module
        // import (bundled by Vite), so it is NOT global by default.
        (window as unknown as { posthog: typeof ph }).posthog = ph;
        console.log(
          "%c[analytics] `posthog` is available in the console (dev only).",
          "color:#8b5cf6",
          "\n  posthog.clear_opt_in_out_capturing()  → reset consent, banner shows again on reload" +
          "\n  posthog.debug()                       → log every event as it fires" +
          "\n  posthog.has_opted_in_capturing()      → is capturing currently on?"
        );
      }
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

type AppUser = { _id?: string; id?: string; name?: string; email?: string };

/** Link the current (previously anonymous) session to a real account. */
export function identifyUser(user: AppUser): void {
  if (!started) return;
  const id = user._id || user.id || user.email;
  if (!id) return;
  posthog.identify(String(id), {
    email: user.email,
    name: user.name,
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

/** True if PostHog actually initialized (valid key present). */
export function analyticsReady(): boolean {
  return started;
}

/** True once the visitor has explicitly accepted OR declined (so hide banner).
 *  If analytics never started (bad/missing key), returns false so the banner
 *  still renders — otherwise a misconfiguration silently hides it and you can't
 *  tell the difference between "already consented" and "analytics is broken". */
export function analyticsDecisionMade(): boolean {
  if (!started) return false;
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

  courseStarted: (p?: { topic?: string; source?: "topic" | "pdf" | "pptx" }) =>
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