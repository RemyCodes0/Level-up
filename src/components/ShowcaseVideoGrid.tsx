"use client";

import { useEffect, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { DynamicPlayer } from "../remotion/DynamicPlayer";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface ShowcaseVideo {
  courseId: string;
  topic: string;
  lessonTitle: string;
  code: string;
  totalFrames: number;
}

// Generates a deterministic gradient + animation seed from the topic string
// so each card looks visually distinct without needing to know the content.
function topicSeed(topic: string) {
  // Use two independent hashes combined — the simple polynomial hash
  // clusters many real topic strings onto the same bucket (mod 6).
  // XOR-mixing with a second pass spreads them much more evenly.
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < topic.length; i++) {
    const c = topic.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x9e3779b9) >>> 0;
  }
  return Math.abs((h1 ^ h2) >>> 0);
}

// Dark, moody backgrounds — pairs with the landing page's #15131F aesthetic
// rather than the bright gradient approach that felt off-brand.
const BACKGROUNDS = [
  { bg: "linear-gradient(145deg, #0D0B14 0%, #1A1028 50%, #0D1A2B 100%)", accent: "#7C3AED" },
  { bg: "linear-gradient(145deg, #0B1120 0%, #0D1F2D 50%, #091419 100%)", accent: "#0EA5E9" },
  { bg: "linear-gradient(145deg, #150D0D 0%, #1F1020 50%, #0D150D 100%)", accent: "#10B981" },
  { bg: "linear-gradient(145deg, #130D1A 0%, #0D1320 50%, #1A100D 100%)", accent: "#F59E0B" },
  { bg: "linear-gradient(145deg, #0B140F 0%, #1A1028 50%, #140B1A 100%)", accent: "#06B6D4" },
  { bg: "linear-gradient(145deg, #1A0D10 0%, #0D1020 50%, #101A0D 100%)", accent: "#FF5C49" },
];

// Six distinct animation styles — one per card type
function AnimatedThumbnail({ topic, index }: { topic: string; index: number }) {
  const seed = topicSeed(topic);
  const { bg, accent } = BACKGROUNDS[index % BACKGROUNDS.length];
  // Use index directly for style so each card gets a different animation
  // regardless of how similar the topic strings are.
  const style = index % 6;
  const uid = seed.toString(36).slice(0, 6);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
      <style>{`
        @keyframes float-${uid} {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-8px) rotate(1deg); }
          66% { transform: translateY(4px) rotate(-1deg); }
        }
        @keyframes dash-${uid} {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fade-up-${uid} {
          0% { opacity: 0; transform: translateY(6px); }
          30% { opacity: 1; transform: translateY(0); }
          70% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-6px); }
        }
        @keyframes spin-slow-${uid} {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-rev-${uid} {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes morph-${uid} {
          0%,100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
        }
        @keyframes wave-${uid} {
          0% { d: path("M0,40 C20,20 40,60 60,40 C80,20 100,50 120,40 L120,80 L0,80 Z"); }
          50% { d: path("M0,50 C20,30 40,70 60,50 C80,30 100,60 120,50 L120,80 L0,80 Z"); }
          100% { d: path("M0,40 C20,20 40,60 60,40 C80,20 100,50 120,40 L120,80 L0,80 Z"); }
        }
        @keyframes blink-${uid} {
          0%,90%,100% { opacity: 1; }
          95% { opacity: 0; }
        }
        @keyframes scan-${uid} {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { top: 90%; opacity: 0; }
        }
        @keyframes glow-pulse-${uid} {
          0%,100% { box-shadow: 0 0 8px 2px ${accent}44; }
          50% { box-shadow: 0 0 24px 8px ${accent}88; }
        }
        @keyframes counter-${uid} {
          0% { transform: translateY(0); }
          100% { transform: translateY(-75%); }
        }
      `}</style>

      {style === 0 && (
        // Orbiting constellation
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} viewBox="0 0 200 120">
          {/* Orbit paths */}
          <ellipse cx="100" cy="60" rx="60" ry="35" fill="none" stroke={`${accent}22`} strokeWidth="0.5" strokeDasharray="3 4" />
          <ellipse cx="100" cy="60" rx="38" ry="22" fill="none" stroke={`${accent}18`} strokeWidth="0.5" strokeDasharray="2 5" />
          {/* Central star */}
          <circle cx="100" cy="60" r="5" fill={accent} opacity="0.9" style={{ animation: `glow-pulse-${uid} 2s ease-in-out infinite` }} />
          {/* Orbiting dots */}
          {[0,1,2,3,4].map(i => {
            const a = (i/5)*Math.PI*2;
            const x = 100 + Math.cos(a)*60;
            const y = 60 + Math.sin(a)*35;
            return <circle key={i} cx={x} cy={y} r={i===2?3:1.5} fill="white" opacity={i===2?0.9:0.4}
              style={{ animation: `float-${uid} ${2+i*0.4}s ease-in-out ${i*0.3}s infinite` }} />;
          })}
          {/* Connection lines */}
          {[[0,2],[1,3],[2,4]].map(([a,b],i) => {
            const ax = 100+Math.cos((a/5)*Math.PI*2)*60, ay = 60+Math.sin((a/5)*Math.PI*2)*35;
            const bx = 100+Math.cos((b/5)*Math.PI*2)*60, by = 60+Math.sin((b/5)*Math.PI*2)*35;
            return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={`${accent}30`} strokeWidth="0.4" />;
          })}
        </svg>
      )}

      {style === 1 && (
        // Terminal / code aesthetic
        <div style={{ position:"absolute", inset:0, padding:"14px 16px", fontFamily:"'JetBrains Mono', monospace" }}>
          {[
            { text: `> init course`, color: `${accent}`, delay: 0 },
            { text: `✓ loading scenes`, color: "#6ee7b7", delay: 0.8 },
            { text: `✓ syncing audio`, color: "#6ee7b7", delay: 1.6 },
            { text: `> rendering...`, color: "rgba(255,255,255,0.5)", delay: 2.4 },
            { text: `█`, color: accent, delay: 3.2 },
          ].map((line, i) => (
            <div key={i} style={{ fontSize: 9, lineHeight: "16px", color: line.color, opacity: 0,
              animation: `fade-up-${uid} 4s ease-in-out ${line.delay}s infinite` }}>
              {line.text}
            </div>
          ))}
        </div>
      )}

      {style === 2 && (
        // Morphing blob with rings
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {/* Rings */}
          {[70,52,36].map((size,i) => (
            <div key={i} style={{
              position:"absolute",
              width:size, height:size,
              borderRadius:"50%",
              border: `1px solid ${accent}${["33","44","66"][i]}`,
              animation: `${i%2===0?`spin-slow-${uid}`:`spin-rev-${uid}`} ${8+i*3}s linear infinite`,
            }} />
          ))}
          {/* Morphing blob */}
          <div style={{
            position:"absolute",
            width: 28, height: 28,
            background: `radial-gradient(circle, ${accent}, ${accent}88)`,
            boxShadow: `0 0 20px 4px ${accent}55`,
            animation: `morph-${uid} 4s ease-in-out infinite, glow-pulse-${uid} 2s ease-in-out infinite`,
          }} />
        </div>
      )}

      {style === 3 && (
        // Wave + data bars
        <div style={{ position:"absolute", inset:0 }}>
          <svg style={{ position:"absolute", bottom:0, left:0, width:"100%", height:"55%" }} viewBox="0 0 200 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`wg-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d="M0,30 C30,10 60,50 90,30 C120,10 150,45 200,25 L200,60 L0,60 Z"
              fill={`url(#wg-${uid})`} style={{ animation: `float-${uid} 4s ease-in-out infinite` }} />
            <path d="M0,35 C30,15 60,55 90,35 C120,15 150,50 200,30 L200,60 L0,60 Z"
              fill={`${accent}15`} style={{ animation: `float-${uid} 5s ease-in-out 0.5s infinite` }} />
          </svg>
          {/* Minimal bars at top */}
          <div style={{ position:"absolute", top:12, left:16, display:"flex", gap:3, alignItems:"flex-end", height:28 }}>
            {[60,80,45,90,55,70,85,40].map((h,i) => (
              <div key={i} style={{ width:5, height:`${h*0.28}px`, borderRadius:2, background:accent,
                opacity: 0.3 + i*0.08,
                animation: `float-${uid} ${1.5+i*0.2}s ease-in-out ${i*0.1}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {style === 4 && (
        // Scanner / HUD
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} viewBox="0 0 200 120">
          {/* Corner brackets */}
          {[[10,10],[190,10],[10,110],[190,110]].map(([x,y],i) => {
            const sx = x < 100 ? 1 : -1, sy = y < 60 ? 1 : -1;
            return (
              <g key={i} stroke={accent} strokeWidth="1.5" fill="none" opacity="0.7">
                <line x1={x} y1={y} x2={x+sx*12} y2={y} />
                <line x1={x} y1={y} x2={x} y2={y+sy*12} />
              </g>
            );
          })}
          {/* Center crosshair */}
          <circle cx="100" cy="60" r="20" stroke={`${accent}44`} strokeWidth="0.5" fill="none" />
          <circle cx="100" cy="60" r="4" stroke={accent} strokeWidth="1" fill="none"
            style={{ animation: `glow-pulse-${uid} 2s ease-in-out infinite` }} />
          <line x1="80" y1="60" x2="92" y2="60" stroke={`${accent}88`} strokeWidth="0.5" />
          <line x1="108" y1="60" x2="120" y2="60" stroke={`${accent}88`} strokeWidth="0.5" />
          <line x1="100" y1="40" x2="100" y2="52" stroke={`${accent}88`} strokeWidth="0.5" />
          <line x1="100" y1="68" x2="100" y2="80" stroke={`${accent}88`} strokeWidth="0.5" />
          {/* Scan line */}
          <line x1="10" y1="60" x2="190" y2="60" stroke={`${accent}33`} strokeWidth="0.5"
            strokeDasharray="4 6" style={{ animation: `spin-slow-${uid} 8s linear infinite`, transformOrigin:"100px 60px" }} />
        </svg>
      )}

      {style === 5 && (
        // Particle network
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} viewBox="0 0 200 120">
          {(() => {
            const pts = Array.from({length:10},(_,i)=>{
              const s=(seed*(i+7)*1234567)>>>0;
              return { x:10+((s^(s>>8))%180), y:10+(((s*999)>>>0)%100) };
            });
            return <>
              {pts.map((a,i)=>pts.slice(i+1).map((b,j)=>{
                const d=Math.hypot(a.x-b.x,a.y-b.y);
                return d<70 ? <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={`${accent}${Math.round((1-d/70)*40).toString(16).padStart(2,"0")}`} strokeWidth="0.4" /> : null;
              }))}
              {pts.map((p,i)=>(
                <circle key={i} cx={p.x} cy={p.y} r={i%3===0?2.5:1.5} fill={i%3===0?accent:"white"}
                  opacity={i%3===0?0.9:0.35}
                  style={{ animation:`float-${uid} ${2.5+i*0.3}s ease-in-out ${i*0.25}s infinite` }} />
              ))}
            </>;
          })()}
        </svg>
      )}

      {/* Consistent vignette on all styles */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)", pointerEvents:"none" }} />
    </div>
  );
}
const STAGE_2 = "#1F1B2E";
const BEAM = "#F6F1E7";
const CORAL = "#FF5C49";
const MUTE = "#9A95AC";
const HAIR = "rgba(246,241,231,0.10)";

function VideoCard({ video, index }: { video: ShowcaseVideo; index: number }) {
  // The actual player (DynamicPlayer) only mounts once the visitor clicks
  // play — having 6 Remotion players all compiling and rendering at once on
  // page load would be needlessly heavy for a landing page.
  const [playing, setPlaying] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: HAIR, backgroundColor: STAGE_2 }}>
      <div className="relative" style={{ aspectRatio: "16/10" }}>
        {playing ? (
          <DynamicPlayer code={video.code} durationInFrames={video.totalFrames} />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 w-full h-full flex items-center justify-center group"
          >
            <AnimatedThumbnail topic={video.topic} index={index} />
            {/* Play button floats above the animation */}
            <div
              className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
              style={{ backgroundColor: CORAL, boxShadow: `0 0 24px ${CORAL}66` }}
            >
              <Play className="h-6 w-6 text-white" fill="white" />
            </div>
          </button>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs uppercase tracking-wide mb-1" style={{ color: CORAL, fontFamily: "'JetBrains Mono', monospace" }}>
          {video.topic}
        </p>
        <p className="text-sm font-medium truncate" style={{ color: BEAM, fontFamily: "'Space Grotesk', sans-serif" }}>
          {video.lessonTitle}
        </p>
      </div>
    </div>
  );
}

export default function ShowcaseVideoGrid() {
  const [videos, setVideos] = useState<ShowcaseVideo[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${BASE_URL}/api/showcase`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => setVideos(data.videos || []))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return null; // fail quietly on a marketing page rather than show an error
  }

  if (!videos) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: MUTE }} />
      </div>
    );
  }

  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map((v, i) => (
        <VideoCard key={v.courseId} video={v} index={i} />
      ))}
    </div>
  );
}