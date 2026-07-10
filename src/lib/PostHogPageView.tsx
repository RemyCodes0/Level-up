import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { capturePageview } from "./analytics";

// Because this is a single-page app (client-side routing), the browser only
// does one real page load — subsequent navigations are JS. We disabled
// PostHog's automatic pageview and fire one here on every route change (and the
// first render), so each screen the user visits is counted exactly once.
// Must be rendered INSIDE <BrowserRouter> so useLocation() works.
export function PostHogPageView() {
  const location = useLocation();

  useEffect(() => {
    capturePageview({
      path: location.pathname,
      search: location.search,
      url: window.location.href,
    });
  }, [location.pathname, location.search]);

  return null;
}