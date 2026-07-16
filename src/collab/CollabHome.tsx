"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/navbar/Navbar";
import { PageMeta } from "@/components/PageMeta";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Loader2, AlertCircle, KeyRound, ArrowRight } from "lucide-react";
import { listMyRooms, joinRoomByCode } from "@/api/CollabApi";
import type { CollabRoomSummary } from "@/api/CollabApi";

export default function CollabHome() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<CollabRoomSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    listMyRooms().then(setRooms).catch(() => setError(true));
  }, []);

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { roomId } = await joinRoomByCode(joinCode);
      navigate(`/collab/${roomId}`);
    } catch (err: any) {
      setJoinError(err.message || "Invalid invite code");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta
        title="Study Groups | Level Up AI"
        description="Create or join a collaborative course — watch AI-generated lessons together, take the quiz individually, and see the whole group's progress."
        canonical="/collab"
      />
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Study Groups</h1>
            <p className="text-slate-500 text-sm mt-1">Learn a course together — everyone watches the same lessons, quizzes individually.</p>
          </div>
          <Button onClick={() => navigate("/collab/new")} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Study Group
          </Button>
        </div>

        <Card className="p-4 sm:p-5 mb-8">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4" /> Have an invite code?</h3>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. A1B2C3D4"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              className="uppercase"
            />
            <Button onClick={handleJoin} disabled={joining || !joinCode.trim()}>
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
          {joinError && <p className="text-xs text-red-500 mt-2">{joinError}</p>}
        </Card>

        <h2 className="text-sm font-semibold text-slate-700 mb-3">Your groups</h2>
        {error ? (
          <p className="text-sm text-red-500">Couldn't load your study groups.</p>
        ) : !rooms ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-100">
            <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">You haven't joined or created a study group yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {rooms.map((r) => (
              <Card
                key={r._id}
                className="p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
                onClick={() => navigate(`/collab/${r._id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-900 truncate">{r.name}</h3>
                  <Badge className="text-xs shrink-0">{r.visibility === "public" ? "Public" : "Invite only"}</Badge>
                </div>
                <p className="text-xs text-slate-500 truncate mb-3">{r.courseId?.topic}</p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {r.participants.length} members</span>
                  {r.courseId?.status === "generating" && (
                    <span className="flex items-center gap-1 text-amber-500"><Loader2 className="h-3 w-3 animate-spin" /> Generating</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
