"use client";

import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, Inbox, X } from "lucide-react";
import { C, SURFACE, EYEBROW, ICON_BTN, cx } from "./theme";

// Shared admin primitives. Every page composes its surfaces out of these, so
// the dashboard's look is tuned in one file — the same reason the learner UI
// keeps SURFACE/BTN_*/EYEBROW in one block at the top of AiTutor.tsx.

/** Standard page frame: centred column, consistent gutters and rhythm. */
export function Page({ children, max = "6xl" }: { children: React.ReactNode; max?: "5xl" | "6xl" | "7xl" }) {
  const width = max === "5xl" ? "max-w-5xl" : max === "7xl" ? "max-w-7xl" : "max-w-6xl";
  return <div className={cx("ad-rise mx-auto px-4 py-8 sm:px-8 sm:py-10", width)}>{children}</div>;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] pb-6">
      <div className="min-w-0">
        <h1 className="ad-serif text-[32px] leading-none text-white sm:text-[40px]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8A8FA3]">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/**
 * A metric tile. `accent` stays a plain Tailwind text-colour class so the
 * existing call sites keep working; it tints the icon chip and the hairline
 * glow at the top of the card.
 */
export function StatCard({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={cx(SURFACE, "group relative overflow-hidden p-5 transition-colors hover:ring-white/[0.14]")}>
      <span
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.14]"
        style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)` }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <span className={EYEBROW}>{label}</span>
        <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] ring-1 ring-white/[0.07]", accent || "text-[#6E7389]")}>
          {icon}
        </span>
      </div>
      <div className="relative mt-3 text-[34px] font-semibold leading-none tracking-[-0.02em] text-white tabular-nums">{value}</div>
      {sub && <div className="relative mt-2 text-[11px] leading-relaxed text-[#6E7389]">{sub}</div>}
    </div>
  );
}

/** A titled panel with an optional header action. */
export function Card({
  title, icon, action, children, pad = true, className,
}: {
  title?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; pad?: boolean; className?: string;
}) {
  return (
    <div className={cx(SURFACE, "overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <h3 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[#E3E5EE]">
            {icon && <span className="shrink-0 text-[#6E7389]">{icon}</span>}
            <span className="truncate">{title}</span>
          </h3>
          {action}
        </div>
      )}
      <div className={pad ? "p-5" : undefined}>{children}</div>
    </div>
  );
}

/** Rows inside a Card({ pad: false }) — hairline-separated, hover-highlighted. */
export function RowList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-white/[0.05]">{children}</div>;
}

export const ROW_HOVER = "transition-colors hover:bg-white/[0.035]";

/** Range / status / tab switcher. */
export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { key: T; label: React.ReactNode }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-[#0C0D13] p-1 ring-1 ring-white/[0.07]">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cx(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all",
            value === o.key
              ? "bg-[#8B7CFF] text-[#0A0B10] shadow-[0_6px_18px_-8px_rgba(139,124,255,0.9)]"
              : "text-[#8A8FA3] hover:bg-white/[0.05] hover:text-white"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <Loader2 className="h-6 w-6 animate-spin text-[#8B7CFF]" />
      <p className="text-xs text-[#6E7389]">Loading…</p>
    </div>
  );
}

/** Shimmering placeholder, for sections that load independently of the page. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("ad-skeleton rounded-2xl ring-1 ring-white/[0.06]", className)} />;
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFB547]/10 ring-1 ring-[#FFB547]/25">
        <AlertTriangle className="h-5 w-5 text-[#FFB547]" />
      </span>
      <p className="ad-serif text-xl text-white">Couldn't load this</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#8A8FA3]">{message}</p>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.015] py-14 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.07]">
        <Inbox className="h-4 w-4 text-[#4A4F63]" />
      </span>
      <p className="text-[13px] font-medium text-[#8A8FA3]">No {label} yet</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ready" || status === "approved" || status === "confirmed" || status === "completed" || status === "active"
      ? "text-[#3DDC97] bg-[#3DDC97]/10 ring-[#3DDC97]/25"
      : status === "failed" || status === "rejected" || status === "canceled"
      ? "text-[#FF8A95] bg-[#FF5C6C]/10 ring-[#FF5C6C]/25"
      : status === "generating" || status === "pending" || status === "rendering" || status === "candidate"
      ? "text-[#B4A9FF] bg-[#8B7CFF]/12 ring-[#8B7CFF]/25"
      : status === "locked"
      ? "text-[#FFB547] bg-[#FFB547]/10 ring-[#FFB547]/25"
      : "text-[#8A8FA3] bg-white/[0.05] ring-white/[0.08]";
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset", tone)}>
      {status}
    </span>
  );
}

/** Neutral pill for inline metadata (tags, "trial", prop docs). */
export function Chip({ children, tone }: { children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone === "danger"
          ? "bg-[#FF5C6C]/10 text-[#FF8A95] ring-[#FF5C6C]/25"
          : "bg-white/[0.04] text-[#8A8FA3] ring-white/[0.07]"
      )}
    >
      {children}
    </span>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-4 border-t border-white/[0.05] py-4">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} className={ICON_BTN} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs text-[#6E7389] tabular-nums">
        Page <span className="font-semibold text-[#D6D8E2]">{page}</span> of {pages}
      </span>
      <button onClick={() => onChange(Math.min(pages, page + 1))} disabled={page >= pages} className={ICON_BTN} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Shared modal chrome. Click-outside and the close button both dismiss; the
 * panel itself stops propagation so clicks inside never close it (the same
 * contract the previous hand-rolled modals had, now in one place).
 */
export function Modal({
  title, sub, onClose, actions, children, width = "lg",
}: {
  title: React.ReactNode; sub?: React.ReactNode; onClose: () => void;
  actions?: React.ReactNode; children: React.ReactNode; width?: "sm" | "lg" | "xl";
}) {
  const max = width === "sm" ? "max-w-sm" : width === "xl" ? "max-w-3xl" : "max-w-2xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05060A]/80 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className={cx(
          "ad-rise ad-scroll max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-[#11131A] ring-1 ring-white/[0.09] shadow-[0_60px_120px_-40px_rgba(0,0,0,1)]",
          max
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.06] bg-[#11131A]/95 px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <h2 className="ad-serif truncate text-2xl leading-tight text-white">{title}</h2>
            {sub && <p className="mt-0.5 truncate text-xs text-[#6E7389]">{sub}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button onClick={onClose} className={ICON_BTN} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The daily bar chart shared by AI Spend and Traffic. Both pages were drawing
 * the same flex-of-divs by hand; this adds the parts they were missing — a
 * baseline, a peak label, and a hover readout — in one place.
 *
 * `format` renders a bar's value for the tooltip/peak label; `tone` picks the
 * accent. Bars keep a 3px floor so a zero day is still a visible tick.
 */
export function Bars({
  data, format, tone = "iris", height = 132,
}: {
  data: { label: string; value: number; hint?: string }[];
  format: (v: number) => string;
  tone?: "iris" | "mint" | "amber";
  height?: number;
}) {
  const peak = Math.max(...data.map((d) => d.value), 0);
  const accent = tone === "mint" ? C.mint : tone === "amber" ? C.amber : C.iris;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-[#4A4F63]">
        <span className={EYEBROW}>Per day</span>
        <span className="tabular-nums">peak {format(peak)}</span>
      </div>
      <div className="flex items-end gap-[3px] border-b border-white/[0.07]" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[3px] transition-all duration-300 group-hover:opacity-100"
              style={{
                height: `${peak > 0 ? Math.max(3, (d.value / peak) * 100) : 3}%`,
                background: `linear-gradient(to top, ${accent}33, ${accent})`,
                opacity: 0.72,
              }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#05060A] px-2.5 py-1.5 text-[11px] text-[#ECEDF2] ring-1 ring-white/[0.12] group-hover:block">
              <span className="font-semibold tabular-nums">{format(d.value)}</span>
              <span className="ml-1.5 text-[#6E7389]">{d.label}</span>
              {d.hint && <span className="ml-1.5 text-[#6E7389]">· {d.hint}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-[#4A4F63]">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtUsd(n: number) {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

// Lessons are always 30fps (see remotion/DynamicPlayer.tsx and the render
// pipeline) — shared here so every admin surface showing playback position
// (Users.tsx's progress modal, Courses.tsx's per-lesson progress) agrees.
const PROGRESS_FPS = 30;

export function fmtMMSS(frames: number): string {
  const totalSeconds = Math.max(0, Math.floor(frames / PROGRESS_FPS));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtPosition(lastFrame: number, totalFrames: number | null): string {
  if (!totalFrames) return fmtMMSS(lastFrame);
  const pct = Math.round((Math.min(lastFrame, totalFrames) / totalFrames) * 100);
  return `${fmtMMSS(lastFrame)} / ${fmtMMSS(totalFrames)} (${pct}%)`;
}

// Formats a duration given in SECONDS (generation-time stats, seconds
// deliberately — GenerationLog's own durationSec — not frames like
// fmtMMSS/fmtPosition above, which are playback positions at 30fps).
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
