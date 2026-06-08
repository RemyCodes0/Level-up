import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights"
import { HelmetProvider } from 'react-helmet-async';



inject();
injectSpeedInsights()


createRoot(document.getElementById('root')!).render(

     <StrictMode>
  <HelmetProvider>
    <App /> 
     </HelmetProvider>
  </StrictMode>

 
)
