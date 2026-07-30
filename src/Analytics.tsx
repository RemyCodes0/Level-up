// src/Analytics.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { pageview } from "./utils/analytics";
import { trackPageView } from "./utils/trackPageView";

export default function Analytics() {
  const location = useLocation();

  useEffect(() => {
    pageview(location.pathname + location.search);
    trackPageView(location.pathname + location.search);
  }, [location]);

  return null;
}