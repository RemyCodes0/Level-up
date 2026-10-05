"use client";

// Self-contained port of AiTutor.tsx's GeneratingStage/SceneTimeline/SceneCell
// (the "Studio" generation-in-progress animation shown on the solo course
// page) — extracted so CollabRoomPage.tsx can show the exact same animation
// while a shared lesson generates, without duplicating AiTutor.tsx's own
// copy or risking a change there. Carries its own <style> block (the lu-*
// keyframes/classes it needs) so it renders correctly on ANY page, not just
// ones that already happen to define them.

import { useEffect, useState } from "react";
import { Thumbnail } from "@remotion/player";
import { Check, Mic, Film } from "lucide-react";
import { useCompilation } from "../remotion/useCompilation";
import type { SceneProgressItem } from "../api/CourseApi";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const C = { iris: "#8B7CFF", ember: "#FF7A45", mint: "#3DDC97" };

const GENERATION_PHASES = ["Planning the scenes…", "Writing narration…", "Recording the voiceover…", "Animating the lesson…"];

const LGV_CSS = `
@keyframes lgv-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes lgv-wave { 0%,100% { transform: scaleY(.22); } 50% { transform: scaleY(1); } }
@keyframes lgv-frame { 0%,100% { opacity: .3; } 50% { opacity: 1; } }
@keyframes lgv-rec { 0%,100% { opacity: 1; } 50% { opacity: .2; } }
@keyframes lgv-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes lgv-scan { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
.lgv-rise { animation: lgv-rise .55s cubic-bezier(.2,.7,.2,1) both; }
.lgv-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.lgv-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
`;

// Same math as AiTutor.tsx's own computeRealLessonProgress — half the bar
// from narration audio landing, half from scene code/animation landing.
export function computeLessonGenerationPct(sceneProgress: SceneProgressItem[] | undefined): number | null {
  if (!sceneProgress || sceneProgress.length === 0) return null;
  const total = sceneProgress.length;
  const audioReadyCount = sceneProgress.filter((s) => s.audioReady).length;
  const codeReadyCount = sceneProgress.filter((s) => s.codeReady).length;
  return (audioReadyCount / total) * 50 + (codeReadyCount / total) * 50;
}

function RecDot({ color = C.ember }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inset-0 rounded-full" style={{ background: color, animation: "lgv-rec 1.4s ease-in-out infinite" }} />
      <span className="absolute -inset-1 rounded-full opacity-30 blur-[3px]" style={{ background: color }} />
    </span>
  );
}

// Before any scene progress has landed at all — a generic "in production"
// filmstrip/waveform animation cycling through phase labels.
function GeneratingStage() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % GENERATION_PHASES.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative flex aspect-video flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#07080C] px-4 text-center ring-1 ring-white/[0.08]">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${C.iris}, transparent)`, animation: "lgv-aurora 10s ease-in-out infinite" }}
      />
      <div className="absolute inset-0 lgv-grain opacity-50" />

      <span className="relative mb-6 inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E3E5EE] ring-1 ring-white/10">
        <RecDot /> In production
      </span>

      <div className="relative mb-6 flex gap-1.5 rounded-lg bg-white/[0.03] p-2 ring-1 ring-white/[0.06]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-6 rounded-[3px] bg-gradient-to-b from-[#8B7CFF]/60 to-[#FF7A45]/30 sm:h-12 sm:w-8"
            style={{ animation: "lgv-frame 2.4s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>

      <div className="relative mb-6 flex h-7 items-center gap-[3px] sm:h-8">
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            className="h-full w-[3px] rounded-full bg-[#B4A9FF]/80"
            style={{ animation: "lgv-wave 1.1s ease-in-out infinite", animationDelay: `${(i % 9) * 0.08}s` }}
          />
        ))}
      </div>

      <p key={phase} className="lgv-rise lgv-serif relative text-2xl text-white sm:text-3xl">{GENERATION_PHASES[phase]}</p>
      <p className="relative mt-1.5 text-xs text-[#6E7389] sm:text-sm">This usually takes about 6 minutes.</p>
    </div>
  );
}

// Only compiles once this scene's own previewCode exists; keyed by scene index.
function SceneCell({ scene }: { scene: SceneProgressItem }) {
  const { Component } = useCompilation(scene.previewCode ?? "");
  const ready = scene.codeReady;
  const hasThumbnail = ready && !!scene.previewCode && !!Component;

  return (
    <div
      className={cx(
        "relative h-14 overflow-hidden rounded-lg ring-1 transition-all duration-700 sm:h-20",
        ready ? "bg-[#3DDC97]/[0.07] ring-[#3DDC97]/40" : "bg-white/[0.03] ring-white/[0.06]"
      )}
      style={{ flexGrow: scene.durationInFrames ?? 1, flexBasis: 0, flexShrink: 0 }}
      title={scene.label}
    >
      {hasThumbnail ? (
        <>
          <Thumbnail
            component={Component!}
            frameToDisplay={Math.min(30, Math.max(1, Math.floor((scene.durationInFrames ?? 60) / 2)))}
            durationInFrames={scene.durationInFrames ?? 1}
            compositionWidth={1920}
            compositionHeight={1080}
            fps={30}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div className="absolute right-1 top-1 rounded-full bg-[#3DDC97] p-0.5 animate-in zoom-in fade-in duration-300">
            <Check className="h-2.5 w-2.5 text-[#06130D]" strokeWidth={3} />
          </div>
        </>
      ) : ready ? (
        <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in fade-in duration-300">
          <Check className="h-4 w-4 text-[#3DDC97] sm:h-5 sm:w-5" strokeWidth={3} />
        </div>
      ) : (
        <div
          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
          style={{ animation: "lgv-scan 2.2s ease-in-out infinite" }}
        />
      )}
    </div>
  );
}

// NLE-style timeline: a voice track and a picture track filling in live —
// shown once the backend has reported at least one scene's progress.
function SceneTimeline({ sceneProgress }: { sceneProgress: SceneProgressItem[] }) {
  const readyCount = sceneProgress.filter((s) => s.codeReady).length;
  const audioCount = sceneProgress.filter((s) => s.audioReady).length;
  const pct = Math.round(computeLessonGenerationPct(sceneProgress) ?? 0);

  return (
    <div className="relative flex aspect-video flex-col overflow-hidden rounded-2xl bg-[#07080C] ring-1 ring-white/[0.08]">
      <div className="absolute inset-0 lgv-grain opacity-40" />
      <div className="relative flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-5">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E3E5EE]">
          <RecDot /> Building lesson
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-white">{pct}%</span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-5 px-4 sm:px-8">
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-[#8A8FA3]">
            <span className="flex items-center gap-1.5"><Mic className="h-3 w-3" /> Voice</span>
            <span className="tabular-nums">{audioCount}/{sceneProgress.length}</span>
          </div>
          <div className="flex h-5 gap-1 sm:h-6">
            {sceneProgress.map((s) => (
              <div
                key={s.index}
                className={cx("relative overflow-hidden rounded-[5px] transition-colors duration-500", s.audioReady ? "bg-[#8B7CFF]/25" : "bg-white/[0.04]")}
                style={{ flexGrow: s.durationInFrames ?? 1, flexBasis: 0, flexShrink: 0 }}
              >
                {s.audioReady && (
                  <div className="absolute inset-0 flex items-center justify-center gap-[2px] px-1">
                    {Array.from({ length: 6 }).map((_, k) => (
                      <span key={k} className="w-[2px] rounded-full bg-[#B4A9FF]" style={{ height: `${30 + ((k * 37 + s.index * 13) % 60)}%` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-[#8A8FA3]">
            <span className="flex items-center gap-1.5"><Film className="h-3 w-3" /> Picture</span>
            <span className="tabular-nums">{readyCount}/{sceneProgress.length}</span>
          </div>
          <div className="flex gap-1 sm:gap-1.5">
            {sceneProgress.map((s) => <SceneCell key={s.index} scene={s} />)}
          </div>
        </div>
      </div>

      <div className="relative px-4 pb-4 sm:px-6 sm:pb-5">
        <p className="lgv-serif text-lg text-white sm:text-xl">{readyCount} of {sceneProgress.length} scenes animated</p>
        <p className="mt-0.5 text-[11px] text-[#6E7389] sm:text-xs">The lesson builds in the background — feel free to browse others.</p>
      </div>
    </div>
  );
}

// Public entry point: picks GeneratingStage (no scene data yet) vs
// SceneTimeline (live per-scene progress) exactly like AiTutor.tsx's own
// lesson stage does — see its "sceneProgress && sceneProgress.length > 0"
// branch.
export function LessonGeneratingView({ sceneProgress }: { sceneProgress?: SceneProgressItem[] }) {
  return (
    <>
      <style>{LGV_CSS}</style>
      {sceneProgress && sceneProgress.length > 0 ? (
        <SceneTimeline sceneProgress={sceneProgress} />
      ) : (
        <GeneratingStage />
      )}
    </>
  );
}
