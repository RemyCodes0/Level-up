import { useEffect, useState } from "react";
import { analyticsDecisionMade, acceptAnalytics, declineAnalytics, analyticsReady } from "./analytics";

// A minimal cookie-consent banner. PostHog is opted-out by default, so until the
// visitor clicks Accept, nothing is captured and no tracking cookies are set —
// which is what GDPR-style explicit consent requires. The banner only shows when
// the visitor hasn't decided yet; PostHog remembers the choice, so it won't nag
// on return visits.
export function CookieConsent() {
  const [show, setShow] = useState(false);
  const ready = analyticsReady();

  useEffect(() => {
    if (!analyticsDecisionMade()) setShow(true);
  }, []);

  if (!show) return null;

  const accept = () => { acceptAnalytics(); setShow(false); };
  const decline = () => { declineAnalytics(); setShow(false); };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl bg-slate-900 text-slate-100 shadow-2xl border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1">
          <p className="text-xs sm:text-sm leading-relaxed text-slate-300">
            We use cookies and analytics to understand how Level Up is used and to
            improve it. You can accept or decline — declining means we won't set
            analytics cookies.{" "}
            <a
              href="/privacy-policy.html"
              className="underline hover:text-white whitespace-nowrap"
            >
              Privacy policy
            </a>
          </p>
          {/* Dev-only: if PostHog never initialized, accepting does nothing.
              Say so loudly here instead of failing silently. */}
          {!ready && import.meta.env.DEV && (
            <p className="mt-2 text-[11px] text-amber-400">
              ⚠️ Dev note: PostHog isn't configured — check the console for
              [analytics] details. Accepting won't capture anything until it's fixed.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white/10 text-slate-200 hover:bg-white/15 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white text-slate-900 hover:bg-slate-200 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}