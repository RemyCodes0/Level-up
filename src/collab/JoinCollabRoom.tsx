"use client";

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PageMeta } from "@/components/PageMeta";
import { Loader2, AlertCircle, Users, Globe2, Lock, ArrowRight, Play, ClipboardList, Trophy, LogIn } from "lucide-react";
import { previewRoomByLink, joinRoomByLink } from "@/api/CollabApi";
import type { RoomInvitePreview } from "@/api/CollabApi";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap";

const PAGE_CSS = `
@keyframes jc-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes jc-aurora { 0%,100% { transform: translate3d(-6%,-4%,0) scale(1); } 50% { transform: translate3d(6%,6%,0) scale(1.15); } }
@keyframes jc-sweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes jc-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.jc-rise { animation: jc-rise .6s cubic-bezier(.2,.7,.2,1) both; }
.jc-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.jc-grain { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 3px 3px; }
`;

const ORBIT_COLORS = ["#8B7CFF", "#3DDC97", "#FF7A45", "#5CE1FF", "#FFB547"];

// Member "orbit" around the group icon — a visual for "people are already here".
function MemberOrbit({ count }: { count: number }) {
  const dots = Math.min(Math.max(count, 1), 5);
  return (
    <div className="relative mx-auto h-28 w-28">
      <div className="absolute inset-0 rounded-full ring-1 ring-white/[0.08]" />
      <div className="absolute inset-0" style={{ animation: "jc-orbit 24s linear infinite" }}>
        {Array.from({ length: dots }).map((_, i) => {
          const a = (i / dots) * Math.PI * 2;
          return (
            <span
              key={i}
              className="absolute h-3.5 w-3.5 rounded-full ring-[3px] ring-[#11131A]"
              style={{
                left: `calc(50% + ${Math.cos(a) * 56}px - 7px)`,
                top: `calc(50% + ${Math.sin(a) * 56}px - 7px)`,
                background: ORBIT_COLORS[i % ORBIT_COLORS.length],
                boxShadow: `0 0 12px ${ORBIT_COLORS[i % ORBIT_COLORS.length]}`,
              }}
            />
          );
        })}
      </div>
      <div className="absolute inset-5 flex items-center justify-center rounded-full bg-gradient-to-br from-[#8B7CFF]/25 to-[#3DDC97]/15 ring-1 ring-white/10">
        <Users className="h-7 w-7 text-white" />
      </div>
    </div>
  );
}

export default function JoinCollabRoom() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<RoomInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const signedIn = typeof window !== "undefined" && !!localStorage.getItem("token");

  useEffect(() => {
    if (!shareToken) return;
    previewRoomByLink(shareToken)
      .then(setPreview)
      .catch((err) => setError(err.message || "This invite link isn't valid anymore."));
  }, [shareToken]);

  const handleJoin = async () => {
    if (!shareToken || joining) return;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate(`/login?next=/collab/invite/${shareToken}`);
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const { roomId } = await joinRoomByLink(shareToken);
      navigate(`/collab/${roomId}`);
    } catch (err: any) {
      // Keep the preview on screen — a failed join is retryable.
      setJoinError(err.message || "Failed to join");
      setJoining(false);
    }
  };

  const isPublic = preview?.visibility === "public";

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#0A0B10] text-[#ECEDF2] antialiased selection:bg-[#8B7CFF]/40"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <PageMeta title="Join Study Group | Level Up AI" noindex />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </Helmet>
      <style>{PAGE_CSS}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-[120px]" style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)" }} />
        <div className="absolute bottom-0 right-0 h-[380px] w-[480px] rounded-full opacity-[0.12] blur-[110px]" style={{ background: "radial-gradient(closest-side, #3DDC97, transparent)" }} />
        <div className="jc-grain absolute inset-0 opacity-60" />
      </div>

      <header className="relative flex h-16 items-center px-4 sm:px-6">
        <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
          <span className="h-8 w-8 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
            <img src="/logo.png" alt="Level Up" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
          </span>
          <span className="jc-serif text-xl text-white">Level Up</span>
        </button>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
        {error ? (
          <div className="jc-rise max-w-sm text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF5C6C]/10 ring-1 ring-[#FF5C6C]/30">
              <AlertCircle className="h-6 w-6 text-[#FF5C6C]" />
            </div>
            <h1 className="jc-serif text-4xl text-white">Invite unavailable</h1>
            <p className="mt-2 text-sm text-[#8A8FA3]">{error}</p>
            <button
              onClick={() => navigate("/collab")}
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-white/[0.06] px-5 text-sm font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-white/[0.1]"
            >
              Browse study groups <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : !preview ? (
          <div className="w-full max-w-md rounded-3xl bg-[#11131A] p-8 ring-1 ring-white/[0.07]" aria-hidden="true">
            {[["h-28 w-28 rounded-full mx-auto", 0], ["h-3 w-32 mx-auto mt-8", 0.1], ["h-10 w-3/4 mx-auto mt-4", 0.15], ["h-4 w-1/2 mx-auto mt-3", 0.2], ["h-12 w-full mt-10 rounded-xl", 0.3]].map(([c, d], i) => (
              <div
                key={i}
                className={cx("rounded-lg bg-white/[0.05]", c as string)}
                style={{ backgroundImage: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)", backgroundSize: "250% 100%", animation: "jc-sweep 1.7s ease-in-out infinite", animationDelay: `${d}s` }}
              />
            ))}
          </div>
        ) : (
          <div className="jc-rise w-full max-w-md">
            <div className="relative overflow-hidden rounded-3xl bg-[#11131A]/95 p-7 text-center shadow-[0_40px_100px_-40px_rgba(0,0,0,1)] ring-1 ring-white/[0.08] backdrop-blur sm:p-9">
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8B7CFF] to-transparent opacity-70" />

              <MemberOrbit count={preview.memberCount} />

              <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6E7389]">You're invited to join</p>
              <h1 className="jc-serif mt-2 text-[36px] leading-[1.08] text-white sm:text-[44px]">{preview.name}</h1>
              {preview.topic && <p className="mx-auto mt-2 max-w-xs text-sm text-[#8A8FA3]">{preview.topic}</p>}

              <div className="mt-5 flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[#D6D8E2] ring-1 ring-white/[0.08]">
                  <Users className="h-3 w-3" /> {preview.memberCount} member{preview.memberCount !== 1 ? "s" : ""}
                </span>
                <span
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1",
                    isPublic ? "bg-[#3DDC97]/10 text-[#7BE8B8] ring-[#3DDC97]/25" : "bg-white/[0.04] text-[#D6D8E2] ring-white/[0.08]"
                  )}
                >
                  {isPublic ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {isPublic ? "Public" : "Invite only"}
                </span>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-2 border-y border-white/[0.06] py-5">
                {[
                  { icon: Play, t: "Watch lessons" },
                  { icon: ClipboardList, t: "Take the quiz" },
                  { icon: Trophy, t: "Compare progress" },
                ].map(({ icon: I, t }) => (
                  <div key={t} className="flex flex-col items-center gap-1.5">
                    <I className="h-4 w-4 text-[#B4A9FF]" />
                    <span className="text-[11px] text-[#8A8FA3]">{t}</span>
                  </div>
                ))}
              </div>

              {joinError && (
                <p className="mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-[#FF5C6C]/[0.08] px-3 py-2.5 text-xs text-[#FF8A95] ring-1 ring-[#FF5C6C]/25">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {joinError}
                </p>
              )}

              <button
                onClick={handleJoin}
                disabled={joining}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B7CFF] text-sm font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(139,124,255,0.8)] transition-all hover:bg-[#A093FF] disabled:opacity-60"
              >
                {joining ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Joining…</>
                ) : signedIn ? (
                  <>Join study group <ArrowRight className="h-4 w-4" /></>
                ) : (
                  <><LogIn className="h-4 w-4" /> Sign in to join</>
                )}
              </button>
              {!signedIn && (
                <p className="mt-3 text-[11px] text-[#6E7389]">You'll come right back here after signing in.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}