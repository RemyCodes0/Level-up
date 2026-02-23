export const pageview = (url: string) => {
  if (typeof window.gtag === "function") {
    window.gtag("config", "G-X3MGJ86VWK", {
      page_path: url,
    });
  } else {
    console.warn("gtag not loaded yet");
  }
};