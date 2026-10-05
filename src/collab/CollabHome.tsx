"use client";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PageMeta } from "@/components/PageMeta";
import { Users, Plus, Loader2, AlertCircle, KeyRound, ArrowRight, Globe2, Lock, RotateCcw, Play, MessagesSquare, Trophy } from "lucide-react";
import { listMyRooms, joinRoomByCode } from "@/api/CollabApi";
import type { CollabRoomSummary } from "@/api/CollabApi";

// ─────────────────────────────────────────────────────────────────────────────
// Design primitives (dark studio)
// ─────────────────────────────────────────────────────────────────────────────

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes ch-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes ch-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes ch-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes ch-rec { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
@keyframes ch-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-5px); } 40%,80% { transform: translateX(5px); } }
.ch-rise { animation: ch-rise .55s cubic-bezier(.2,.7,.2,1) both; }
.ch-shake { animation: ch-shake .4s ease; }
.ch-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.ch-mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, monospace; }
.ch-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
`;

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]";

// Stable per-room accent so each group card has its own identity.
const PALETTES: [string, string][] = [
  ["#8B7CFF", "#FF7A45"], ["#3DDC97", "#3A7BFF"], ["#FF5C8A", "#FFB547"], ["#5CE1FF", "#8B7CFF"],
  ["#FFB547", "#FF5C6C"], ["#B6F36B", "#3DDC97"], ["#FF7AD9", "#6B5CFF"], ["#4DD4C6", "#B4A9FF"],
];
function paletteFor(id: string): [string, string] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return PALETTES[(h >>> 0) % PALETTES.length];
}

function MemberStack({ count, colors }: { count: number; colors: [string, string] }) {
  const shown = Math.min(count, 4);
  return (
    <span className="flex items-center">
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className="h-6 w-6 rounded-full ring-2 ring-[#11131A]"
          style={{
            marginLeft: i === 0 ? 0 : -8,
            background: `linear-gradient(${135 + i * 40}deg, ${colors[i % 2]}, ${colors[(i + 1) % 2]})`,
            opacity: 1 - i * 0.15,
          }}
        />
      ))}
      {count > 4 && (
        <span className="-ml-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white/[0.08] px-1.5 text-[10px] font-semibold text-[#D6D8E2] ring-2 ring-[#11131A]">
          +{count - 4}
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CollabHome() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<CollabRoomSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const loadRooms = () => {
    setError(false);
    setRooms(null);
    listMyRooms().then(setRooms).catch(() => setError(true));
  };
  useEffect(() => { loadRooms(); }, []);

  const handleJoin = async () => {
    if (!joinCode.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { roomId } = await joinRoomByCode(joinCode);
      navigate(`/collab/${roomId}`);
    } catch (err: any) {
      setJoinError(err.message || "Invalid invite code");
      setShakeKey((k) => k + 1);
      codeRef.current?.select();
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <PageMeta
        title="Study Groups | Level Up AI"
        description="Create or join a collaborative course — watch AI-generated lessons together, take the quiz individually, and see the whole group's progress."
        canonical="/collab"
      />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden" aria-hidden="true">
        <div className="absolute -top-56 left-1/3 h-[520px] w-[760px] -translate-x-1/2 rounded-full opacity-25 blur-[110px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "ch-aurora 18s ease-in-out infinite" }} />
        <div className="absolute -right-32 top-16 h-[360px] w-[460px] rounded-full opacity-[0.14] blur-[110px]" style={{ background: "radial-gradient(closest-side, #3DDC97, transparent)", animation: "ch-aurora 22s ease-in-out infinite reverse" }} />
        <div className="ch-grain absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0A0B10]" />
      </div>

      <main className="relative mx-auto max-w-5xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        {/* Hero */}
        <div className="ch-rise flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#B9BCCB] ring-1 ring-white/[0.08]">
              <Users className="h-3.5 w-3.5 text-[#7BE8B8]" /> Study groups
            </span>
            <h1 className="ch-serif mt-5 text-[44px] leading-[1.02] text-white sm:text-[64px]">
              Learn it <span className="italic bg-gradient-to-r from-[#7BE8B8] via-[#8B7CFF] to-[#FF7A45] bg-clip-text text-transparent">together</span>.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[#8A8FA3]">
              Everyone watches the same AI-generated lessons, takes the quiz on their own, and sees how the whole group is doing.
            </p>
          </div>
          <button
            onClick={() => navigate("/collab/new")}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[#8B7CFF] px-5 text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] transition-all hover:bg-[#A093FF] md:self-auto"
          >
            <Plus className="h-4 w-4" /> New study group
          </button>
        </div>

        {/* How it works + join */}
        <div className="ch-rise mt-10 grid gap-4 lg:grid-cols-[1.3fr_1fr]" style={{ animationDelay: "80ms" }}>
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-[#11131A]/80 p-4 ring-1 ring-white/[0.07] sm:p-5">
            {[
              { icon: Play, t: "Watch together", d: "Same lessons, same pace" },
              { icon: MessagesSquare, t: "Quiz solo", d: "Everyone tests individually" },
              { icon: Trophy, t: "Compare", d: "See the group's progress" },
            ].map(({ icon: I, t, d }) => (
              <div key={t}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08]">
                  <I className="h-3.5 w-3.5 text-[#B4A9FF]" />
                </span>
                <p className="mt-2.5 text-[13px] font-semibold text-white">{t}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#6E7389]">{d}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.015] p-4 ring-1 ring-white/[0.08] sm:p-5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <KeyRound className="h-4 w-4 text-[#FFB547]" /> Have an invite code?
            </p>
            <div key={shakeKey} className={cx("mt-3 flex gap-2", shakeKey > 0 && "ch-shake")}>
              <input
                ref={codeRef}
                placeholder="A1B2C3D4"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase().replace(/\s/g, "")); if (joinError) setJoinError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                aria-label="Invite code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className={cx(
                  "ch-mono h-11 min-w-0 flex-1 rounded-xl bg-[#0A0B10]/70 px-4 text-[15px] font-semibold uppercase tracking-[0.25em] text-white ring-1 transition-all placeholder:tracking-[0.25em] placeholder:text-[#3E4253] focus:outline-none",
                  joinError ? "ring-[#FF5C6C]/60" : "ring-white/[0.1] focus:ring-[#8B7CFF]/70"
                )}
              />
              <button
                onClick={handleJoin}
                disabled={joining || !joinCode.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#0A0B10] transition-all hover:scale-105 disabled:scale-100 disabled:bg-white/[0.06] disabled:text-[#555A6E]"
                aria-label="Join group"
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
            {joinError ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-[#FF8A95]"><AlertCircle className="h-3.5 w-3.5" /> {joinError}</p>
            ) : (
              <p className="mt-2 text-[11px] text-[#555A6E]">Ask the group's creator for their 8-character code.</p>
            )}
          </div>
        </div>

        {/* Groups */}
        <div className="mt-14 mb-4 flex items-baseline justify-between">
          <p className={EYEBROW}>Your groups</p>
          {rooms && rooms.length > 0 && <p className="text-xs text-[#555A6E]">{rooms.length} group{rooms.length !== 1 ? "s" : ""}</p>}
        </div>

        {error ? (
          <div className="ch-rise flex flex-col items-center rounded-2xl bg-[#11131A] py-14 text-center ring-1 ring-white/[0.07]">
            <AlertCircle className="mb-3 h-6 w-6 text-[#FF5C6C]" />
            <p className="ch-serif text-2xl text-white">Couldn't load your study groups</p>
            <button onClick={loadRooms} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-white/[0.06] px-4 text-sm font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-white/[0.1]">
              <RotateCcw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : !rooms ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[148px] rounded-2xl bg-[#11131A] ring-1 ring-white/[0.07]"
                style={{
                  backgroundImage: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.05) 50%, transparent 65%)",
                  backgroundSize: "250% 100%",
                  animation: "ch-sweep 1.7s ease-in-out infinite",
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="ch-rise relative overflow-hidden rounded-2xl bg-[#11131A] px-6 py-16 text-center ring-1 ring-white/[0.07]">
            <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 rounded-full bg-[#8B7CFF]/15 blur-3xl" />
            <div className="relative mx-auto mb-5 flex w-fit items-center">
              {["#8B7CFF", "#3DDC97", "#FF7A45"].map((c, i) => (
                <span key={c} className="flex h-11 w-11 items-center justify-center rounded-full ring-4 ring-[#11131A]" style={{ marginLeft: i ? -12 : 0, background: `${c}30` }}>
                  <Users className="h-4 w-4" style={{ color: c }} />
                </span>
              ))}
            </div>
            <p className="ch-serif relative text-3xl text-white">No study groups yet</p>
            <p className="relative mx-auto mt-2 max-w-sm text-sm text-[#8A8FA3]">Start one around any topic and invite friends with a code — or join an existing group above.</p>
            <button
              onClick={() => navigate("/collab/new")}
              className="relative mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#8B7CFF] px-5 text-sm font-semibold text-[#0A0B10] transition-colors hover:bg-[#A093FF]"
            >
              <Plus className="h-4 w-4" /> Create your first group
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rooms.map((r, i) => {
              const colors = paletteFor(r._id);
              const generating = r.courseId?.status === "generating";
              const isPublic = r.visibility === "public";
              const members = r.participants.length;
              return (
                <button
                  key={r._id}
                  onClick={() => navigate(`/collab/${r._id}`)}
                  className="ch-rise group relative flex flex-col overflow-hidden rounded-2xl bg-[#11131A] p-5 text-left ring-1 ring-white/[0.07] transition-all duration-300 hover:-translate-y-1 hover:ring-white/[0.18] hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]"
                  style={{ animationDelay: `${Math.min(i, 9) * 45}ms` }}
                >
                  <span
                    className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
                    style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
                  />
                  <span className="absolute inset-x-0 top-0 h-px opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${colors[0]}, ${colors[1]}, transparent)` }} />

                  <div className="relative flex items-start justify-between gap-3">
                    <h3 className="ch-serif line-clamp-2 text-[26px] leading-[1.1] text-white">{r.name}</h3>
                    <span
                      className={cx(
                        "mt-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                        isPublic ? "bg-[#3DDC97]/10 text-[#7BE8B8] ring-[#3DDC97]/25" : "bg-white/[0.04] text-[#B9BCCB] ring-white/[0.1]"
                      )}
                    >
                      {isPublic ? <Globe2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                      {isPublic ? "Public" : "Invite only"}
                    </span>
                  </div>
                  {r.courseId?.topic && <p className="relative mt-1.5 truncate text-[13px] text-[#8A8FA3]">{r.courseId.topic}</p>}

                  <div className="relative mt-6 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
                    <span className="flex items-center gap-2.5 text-xs text-[#B9BCCB]">
                      <MemberStack count={Math.max(members, 1)} colors={colors} />
                      {members} member{members !== 1 ? "s" : ""}
                    </span>
                    {generating ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-[#FFB08A]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A45]" style={{ animation: "ch-rec 1.4s ease-in-out infinite" }} /> Generating
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-[#6E7389] transition-colors group-hover:text-white">
                        Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}