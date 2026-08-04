"use client";

import { Loader2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className={accent || "text-slate-300"}>{icon}</div>
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-7 w-7 text-slate-400 animate-spin" />
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <AlertTriangle className="h-9 w-9 text-amber-500 mb-3" />
      <p className="text-sm text-slate-500 max-w-sm">{message}</p>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/60">
      <p className="text-sm font-medium text-slate-500">No {label} yet</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ready" || status === "approved" || status === "confirmed" || status === "completed"
      ? "text-emerald-700 bg-emerald-50"
      : status === "failed" || status === "rejected" || status === "canceled"
      ? "text-red-700 bg-red-50"
      : status === "generating" || status === "pending" || status === "rendering"
      ? "text-blue-700 bg-blue-50"
      : "text-slate-600 bg-slate-100";
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${color}`}>{status}</span>;
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs text-slate-500">
        Page {page} of {pages}
      </span>
      <button
        onClick={() => onChange(Math.min(pages, page + 1))}
        disabled={page >= pages}
        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
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
