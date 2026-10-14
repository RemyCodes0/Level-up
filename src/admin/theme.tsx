"use client";

import { Helmet } from "react-helmet-async";

// ─────────────────────────────────────────────────────────────────────────────
// Admin design tokens.
//
// Deliberately a mirror of the learner-facing studio UI (src/ai/AiTutor.tsx's
// C / SURFACE / BTN_* / EYEBROW block and its STUDIO_CSS) rather than a second
// independent look: same near-black canvas, same iris/ember/mint accents, same
// Geist + Instrument Serif pairing, same hairline rings instead of borders.
// The class prefix is `ad-` (not `lu-`) only so the two stylesheets can both
// be mounted without clashing — the values are intentionally identical.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  iris: "#8B7CFF",
  ember: "#FF7A45",
  mint: "#3DDC97",
  amber: "#FFB547",
  rose: "#FF5C6C",
};

/** Page canvas. */
export const BG = "#0A0B10";
/** Raised card. */
export const PANEL = "#11131A";
/** Recessed chrome (sidebar, inputs, table heads). */
export const WELL = "#0C0D13";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export const SURFACE = "rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]";
export const HAIRLINE = "border-white/[0.06]";
export const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]";

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-xl h-10 px-4 text-[13px] font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]/60";
export const BTN_GHOST = `${BTN_BASE} text-[#B9BCCB] hover:text-white hover:bg-white/[0.06]`;
export const BTN_SOFT = `${BTN_BASE} text-[#E3E5EE] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.09] hover:ring-white/[0.14]`;
export const BTN_PRIMARY = `${BTN_BASE} font-semibold text-[#0A0B10] bg-[#8B7CFF] hover:bg-[#A093FF] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)]`;
export const BTN_DANGER = `${BTN_BASE} font-semibold text-[#0A0B10] bg-[#FF5C6C] hover:bg-[#FF7B88] shadow-[0_10px_30px_-10px_rgba(255,92,108,0.7)]`;
export const BTN_MINT = `${BTN_BASE} font-semibold text-[#0A0B10] bg-[#3DDC97] hover:bg-[#5FE8AC] shadow-[0_10px_30px_-10px_rgba(61,220,151,0.7)]`;

/** Square icon-only button, sized to sit inline with text rows. */
export const ICON_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40 disabled:pointer-events-none";

export const INPUT =
  "w-full rounded-xl bg-[#0C0D13] px-3.5 py-2.5 text-sm text-[#ECEDF2] placeholder:text-[#4A4F63] ring-1 ring-inset ring-white/[0.08] transition-colors outline-none focus:ring-[#8B7CFF]/60 focus:bg-[#0E1016]";
export const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6E7389]";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap";

const ADMIN_CSS = `
@keyframes ad-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes ad-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes ad-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
.ad-rise { animation: ad-rise .5s cubic-bezier(.2,.7,.2,1) both; }
.ad-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.ad-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
.ad-shell { font-family: 'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif; }
.ad-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.1) transparent; }
.ad-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.ad-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 8px; }
.ad-scroll::-webkit-scrollbar-track { background: transparent; }
/* Dark-canvas form controls: without these the native widgets render as
   white-on-white islands in the middle of the panels. */
.ad-shell input, .ad-shell textarea, .ad-shell select { color-scheme: dark; }
.ad-shell input[type="checkbox"] { accent-color: ${C.iris}; }
.ad-shell ::placeholder { color: #4A4F63; }
.ad-skeleton { background: linear-gradient(90deg, rgba(255,255,255,.03), rgba(255,255,255,.08), rgba(255,255,255,.03)); background-size: 200% 100%; animation: ad-sweep 1.4s linear infinite; }
`;

/** Mounts the admin fonts + stylesheet. Rendered once, by AdminLayout. */
export function AdminStyles() {
  return (
    <>
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{ADMIN_CSS}</style>
    </>
  );
}

/**
 * The ambient glow behind the whole dashboard — the admin counterpart of the
 * learner UI's aurora wash. Purely decorative and pointer-transparent.
 */
export function Aurora() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -left-40 -top-56 h-[520px] w-[620px] rounded-full opacity-[0.16] blur-[120px]"
        style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }}
      />
      <div
        className="absolute -right-48 top-1/3 h-[420px] w-[520px] rounded-full opacity-[0.10] blur-[120px]"
        style={{ background: `radial-gradient(closest-side, ${C.ember}, transparent)` }}
      />
      <div className="ad-grain absolute inset-0 opacity-[0.35]" />
    </div>
  );
}
