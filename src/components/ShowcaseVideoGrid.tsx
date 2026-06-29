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

// ── Design tokens — matches LandingPage's "Cutting Room" palette ───────────
const STAGE_2 = "#1F1B2E";
const BEAM = "#F6F1E7";
const CORAL = "#FF5C49";
const MUTE = "#9A95AC";
const HAIR = "rgba(246,241,231,0.10)";

function VideoCard({ video }: { video: ShowcaseVideo }) {
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
            style={{ backgroundColor: "#0F0D17" }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
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
      {videos.map((v) => (
        <VideoCard key={v.courseId} video={v} />
      ))}
    </div>
  );
}