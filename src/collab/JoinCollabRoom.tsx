"use client";

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/navbar/Navbar";
import { PageMeta } from "@/components/PageMeta";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Users, Globe2, Lock } from "lucide-react";
import { previewRoomByLink, joinRoomByLink } from "@/api/CollabApi";
import type { RoomInvitePreview } from "@/api/CollabApi";

export default function JoinCollabRoom() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<RoomInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    previewRoomByLink(shareToken)
      .then(setPreview)
      .catch((err) => setError(err.message));
  }, [shareToken]);

  const handleJoin = async () => {
    if (!shareToken) return;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate(`/login?next=/collab/invite/${shareToken}`);
      return;
    }
    setJoining(true);
    try {
      const { roomId } = await joinRoomByLink(shareToken);
      navigate(`/collab/${roomId}`);
    } catch (err: any) {
      setError(err.message || "Failed to join");
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta title="Join Study Group | Level Up AI" noindex />
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        {error ? (
          <>
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-4" />
            <p className="text-slate-600 text-sm">{error}</p>
          </>
        ) : !preview ? (
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
        ) : (
          <Card className="p-6">
            <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="h-7 w-7 text-blue-600" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 mb-1">{preview.name}</h1>
            <p className="text-sm text-slate-500 mb-4">{preview.topic}</p>
            <p className="text-xs text-slate-400 flex items-center justify-center gap-3 mb-6">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {preview.memberCount} members</span>
              <span className="flex items-center gap-1">{preview.visibility === "public" ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {preview.visibility === "public" ? "Public" : "Invite only"}</span>
            </p>
            <Button className="w-full" onClick={handleJoin} disabled={joining}>
              {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Join study group
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
