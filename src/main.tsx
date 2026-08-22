import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights"
import { HelmetProvider } from 'react-helmet-async';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { initAnalytics } from './lib/analytics';



inject();
injectSpeedInsights()
initAnalytics(); // PostHog — starts autocapture for all visitors (incl. anonymous)

// Wraps the whole app so Login/Signup's <GoogleLogin> button (see
// src/login/Login.tsx, src/signup/Signup.tsx) can render anywhere without
// each page separately configuring the client id. Safe to expose — this is
// the PUBLIC OAuth client id, not a secret (unlike GOOGLE_CLIENT_ID's
// server-side use verifying tokens, no key here can authenticate anything
// by itself). If unset, GoogleOAuthProvider still renders children fine —
// only the Google button itself fails when actually clicked, so this never
// blocks the rest of the app from loading.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

createRoot(document.getElementById('root')!).render(

     <StrictMode>
  <HelmetProvider>
    {/* locale="en" — without it, Google's own button/popup renders in
        whatever language the visitor's BROWSER is set to (not this app's
        own language), which is where the Arabic UI came from. Forces
        plain English regardless of browser locale. */}
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID} locale="en">
      <App />
    </GoogleOAuthProvider>
     </HelmetProvider>
  </StrictMode>


)