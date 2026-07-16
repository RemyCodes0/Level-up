"use client";

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/navbar/Navbar";
import { PageMeta } from "@/components/PageMeta";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle, Globe2, Lock, Paperclip, X, Copy, Check } from "lucide-react";
import { createCollabRoom } from "@/api/CollabApi";

export default function CreateCollabRoom() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<"public" | "invite-only">("invite-only");
  const [completionThreshold, setCompletionThreshold] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ roomId: string; inviteCode: string; joinUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!topic.trim() && !file) {
      setError("Add a topic or upload a PDF/PPTX.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createCollabRoom(topic.trim(), file, {
        name: name.trim() || topic.trim(),
        visibility,
        completionThreshold,
      });
      setCreated(result);
    } catch (err: any) {
      setError(err.message || "Failed to create study group");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PageMeta title="Study Group Created | Level Up AI" noindex />
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="h-14 w-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Study group created!</h1>
          <p className="text-sm text-slate-500 mb-6">
            The course is generating now. Share this invite code with your group — anyone with it can join.
          </p>
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 border border-slate-200 bg-white mb-4">
            <span className="text-2xl font-mono font-bold text-slate-800 flex-1">{created.inviteCode}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(created.inviteCode).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-slate-400 hover:text-slate-600"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Button className="w-full" onClick={() => navigate(`/collab/${created.roomId}`)}>
            Go to study group
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta title="New Study Group | Level Up AI" noindex />
      <Navbar />
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">New Study Group</h1>
        <p className="text-sm text-slate-500 mb-6">Everyone in the group watches the same AI-generated course and keeps their own progress.</p>

        <Card className="p-5 space-y-4">
          <div>
            <Label htmlFor="name">Group name (optional)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bio 101 Study Group" className="mt-1.5" />
          </div>

          <div>
            <Label htmlFor="topic">Topic</Label>
            <Textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Explain cellular respiration and the Krebs cycle…"
              rows={3}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Or upload a PDF/PPTX instead</Label>
            <input ref={fileRef} type="file" accept=".pdf,.pptx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <button onClick={() => setFile(null)}><X className="h-3.5 w-3.5 text-slate-400" /></button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-1.5 w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" /> Attach file
              </button>
            )}
          </div>

          <div>
            <Label>Who can join</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setVisibility("invite-only")}
                className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  visibility === "invite-only" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
                }`}
              >
                <Lock className="h-3.5 w-3.5" /> Invite only
              </button>
              <button
                onClick={() => setVisibility("public")}
                className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  visibility === "public" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
                }`}
              >
                <Globe2 className="h-3.5 w-3.5" /> Public
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="threshold">Remedial lesson trigger — % of members who must finish the quiz</Label>
            <div className="flex items-center gap-3 mt-1.5">
              <input
                id="threshold"
                type="range"
                min={1}
                max={100}
                value={completionThreshold}
                onChange={(e) => setCompletionThreshold(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-semibold text-slate-700 w-12 text-right">{completionThreshold}%</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Once this many members submit the quiz, AI generates a remedial lesson on the group's weakest topic.</p>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create study group
          </Button>
        </Card>
      </div>
    </div>
  );
}
