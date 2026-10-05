"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, SkipForward, ArrowRight, Keyboard, Sparkles } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

type Level = "beginner" | "intermediate" | "advanced" | null;
type Turn = { intro: string; question: string; options: string[]; answer: string };

interface ChatMessage {
  role: "ai" | "user";
  text: string;
  intro?: string;       // AI question messages: the conversational lead-in, styled separately
  options?: string[];   // only on AI question messages
  answered?: boolean;   // becomes true once the user picks
  final?: boolean;      // the closing "building at X level" message
}

interface LevelAssessmentChatProps {
  topic: string;
  onComplete: (level: Level) => void;
  onSkip: () => void;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Self-contained so the component renders correctly wherever it's mounted.
const CHAT_CSS = `
@keyframes lac-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes lac-dot { 0%, 80%, 100% { opacity: .2; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@keyframes lac-glow { 0%,100% { opacity: .35; } 50% { opacity: .7; } }
.lac-rise { animation: lac-rise .45s cubic-bezier(.2,.7,.2,1) both; }
.lac-serif { font-family: 'Instrument Serif', ui-serif, Georgia, serif; font-weight: 400; letter-spacing: -0.012em; }
.lac-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.1) transparent; }
.lac-scroll::-webkit-scrollbar { width: 8px; }
.lac-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 8px; }
`;

const LEVEL_META: Record<Exclude<Level, null>, { label: string; color: string }> = {
  beginner: { label: "Beginner", color: "#3DDC97" },
  intermediate: { label: "Intermediate", color: "#8B7CFF" },
  advanced: { label: "Advanced", color: "#FF7A45" },
};

// A short, conversational, adaptive level check shown before course
// generation. Streams the AI's question over SSE, lets the user answer via
// tappable (or keyboard) MCQ options, and ends by telling the parent what
// level was determined (or null if skipped/failed).
export function LevelAssessmentChat({ topic, onComplete, onSkip }: LevelAssessmentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<string[] | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{ intro: string; question: string; options: string[]; isLast: boolean } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 4 });
  const [resultLevel, setResultLevel] = useState<Level>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  // Blocks a second answer (fast double-tap / key repeat) before the
  // options state has re-rendered away. Released when new options arrive.
  const answerLockRef = useRef(false);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, currentOptions]);

  // Kick off the first question on mount (guard against double-run in strict mode).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fetchNextQuestion([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streams the next question over SSE into a placeholder AI message, then
  // swaps in the clean parsed question + enables options on "done". Raw
  // tokens are JSON fragments, so they're accumulated but never rendered.
  const fetchNextQuestion = async (currentTurns: Turn[]) => {
    setStreaming(true);
    setCurrentOptions(null);
    setMessages((prev) => [...prev, { role: "ai", text: "" }]);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/assessment/next-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic, turns: currentTurns }),
      });

      if (!res.ok || !res.body) throw new Error("Failed to start assessment stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let rawAccumulated = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by double newlines.
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace("event:", "").trim();
          const data = JSON.parse(dataLine.replace("data:", "").trim());

          if (event === "token") {
            rawAccumulated += data.text;
          } else if (event === "done") {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "ai",
                intro: data.intro ?? "",
                text: data.question,
                options: data.options,
                answered: false,
              };
              return next;
            });
            answerLockRef.current = false;
            setCurrentOptions(data.options);
            setPendingQuestion({
              intro: data.intro ?? "",
              question: data.question,
              options: data.options,
              isLast: data.isLastQuestion,
            });
            setProgress({ current: data.questionNumber, total: data.totalQuestions });
          } else if (event === "error") {
            throw new Error(data.message || "Assessment error");
          }
        }
      }
    } catch (err) {
      console.error("Assessment stream failed:", err);
      // Non-fatal — continue into the course without a level.
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "ai", text: "Hmm, I couldn't load that — no worries, let's jump straight into your course." };
        return next;
      });
      setTimeout(() => onComplete(null), 1200);
    } finally {
      setStreaming(false);
    }
  };

  const handleAnswer = async (option: string) => {
    if (!pendingQuestion || answerLockRef.current) return;
    answerLockRef.current = true;

    setMessages((prev) => {
      const next = prev.map((m) => (m.options ? { ...m, answered: true } : m));
      return [...next, { role: "user", text: option }];
    });
    setCurrentOptions(null);

    const newTurn: Turn = {
      intro: pendingQuestion.intro,
      question: pendingQuestion.question,
      options: pendingQuestion.options,
      answer: option,
    };
    const updatedTurns = [...turns, newTurn];
    setTurns(updatedTurns);

    const wasLast = pendingQuestion.isLast;
    setPendingQuestion(null);

    if (wasLast) {
      await finishAssessment(updatedTurns);
    } else {
      // Small natural pause before the next question streams in.
      setTimeout(() => fetchNextQuestion(updatedTurns), 500);
    }
  };

  const finishAssessment = async (finalTurns: Turn[]) => {
    setFinishing(true);
    setMessages((prev) => [...prev, { role: "ai", text: "" }]);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/assessment/determine-level`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic, turns: finalTurns }),
      });
      const data = await res.json();
      const level: Level = data.level ?? null;

      const levelLabel =
        level === "advanced" ? "an advanced level" :
        level === "intermediate" ? "an intermediate level" :
        level === "beginner" ? "a beginner-friendly level" :
        "the right level";

      setResultLevel(level);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "ai", text: `Perfect — I'll build your course at ${levelLabel}.`, final: true };
        return next;
      });

      setTimeout(() => onComplete(level), 1600);
    } catch (err) {
      console.error("Failed to determine level:", err);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "ai", text: "All set — let's start your course!", final: true };
        return next;
      });
      setTimeout(() => onComplete(null), 1400);
    }
  };

  // Keyboard: A–D / 1–4 to answer the current question.
  const optionsVisible = !!currentOptions && !streaming;
  useEffect(() => {
    if (!optionsVisible || !currentOptions) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.key.length !== 1) return;
      const k = e.key.toLowerCase();
      const idx = /[1-8]/.test(k) ? Number(k) - 1 : "abcdefgh".indexOf(k);
      if (idx >= 0 && idx < currentOptions.length) { e.preventDefault(); handleAnswer(currentOptions[idx]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsVisible, currentOptions, pendingQuestion, turns]);

  const answeredCount = turns.length;
  const done = finishing && messages[messages.length - 1]?.final;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#0E1016] text-[#ECEDF2]"
      style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <style>{CHAT_CSS}</style>
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: "radial-gradient(closest-side, #8B7CFF, transparent)", animation: "lac-glow 6s ease-in-out infinite" }}
        aria-hidden="true"
      />

      {/* Header — step counter, segmented progress, skip */}
      <div className="relative shrink-0 border-b border-white/[0.06] px-4 pb-3 pt-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
              <img src="/logo.png" alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
            </span>
            <p className="truncate text-[13px] text-[#B9BCCB]">
              {done
                ? "Level set"
                : progress.current > 0
                ? <>Question <span className="font-semibold text-white">{progress.current}</span> <span className="text-[#555A6E]">of {progress.total}</span></>
                : "Getting started…"}
            </p>
          </div>
          {!done && (
            <button
              onClick={onSkip}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[#8A8FA3] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <SkipForward className="h-3.5 w-3.5" /> Skip
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {Array.from({ length: progress.total }).map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-500"
              style={{
                background: done || i < answeredCount
                  ? "#3DDC97"
                  : i === progress.current - 1
                  ? "#8B7CFF"
                  : "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="lac-scroll relative flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.map((m, i) => {
            const isLastAi = m.role === "ai" && i === messages.length - 1;
            const showTyping = isLastAi && m.text === "" && (streaming || finishing);

            if (m.role === "user") {
              return (
                <div key={i} className="lac-rise flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#8B7CFF] px-4 py-2.5 text-sm font-medium leading-relaxed text-[#0A0B10] shadow-[0_10px_30px_-12px_rgba(139,124,255,0.9)]">
                    {m.text}
                  </div>
                </div>
              );
            }

            const isActiveQuestion = !!m.options && !m.answered;
            return (
              <div key={i} className={cx("lac-rise flex gap-3", m.answered && "opacity-60 transition-opacity")}>
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/[0.08]">
                  <Sparkles className="h-3.5 w-3.5 text-[#B4A9FF]" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  {showTyping ? (
                    <span className="flex items-center gap-2 py-1.5 text-xs text-[#6E7389]">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="h-1.5 w-1.5 rounded-full bg-[#B4A9FF]" style={{ animation: "lac-dot 1.2s ease-in-out infinite", animationDelay: `${d * 0.15}s` }} />
                        ))}
                      </span>
                      {finishing ? "Reading your answers…" : "Thinking…"}
                    </span>
                  ) : m.final ? (
                    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.08]">
                      {resultLevel && (
                        <span
                          className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{ color: LEVEL_META[resultLevel].color, background: `${LEVEL_META[resultLevel].color}18` }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_META[resultLevel].color }} />
                          {LEVEL_META[resultLevel].label}
                        </span>
                      )}
                      <p className="lac-serif text-2xl leading-snug text-white">{m.text}</p>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-[#8A8FA3]">
                        <Loader2 className="h-3 w-3 animate-spin" /> Starting production…
                      </p>
                    </div>
                  ) : m.options ? (
                    <>
                      {m.intro && <p className="mb-1.5 text-sm leading-relaxed text-[#8A8FA3]">{m.intro}</p>}
                      <p className={cx("lac-serif leading-snug text-white", isActiveQuestion ? "text-[26px] sm:text-[30px]" : "text-xl")}>{m.text}</p>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-[#D6D8E2]">{m.text}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Answer options for the current question */}
          {optionsVisible && currentOptions && (
            <div className="space-y-2 pl-10">
              {currentOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(opt)}
                  className="lac-rise group flex w-full items-center gap-3 rounded-xl bg-white/[0.02] p-3.5 text-left text-sm text-[#D6D8E2] ring-1 ring-white/[0.08] transition-all hover:translate-x-0.5 hover:bg-[#8B7CFF]/[0.1] hover:text-white hover:ring-[#8B7CFF]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7CFF]"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] font-mono text-xs font-semibold text-[#8A8FA3] transition-colors group-hover:bg-[#8B7CFF] group-hover:text-[#0A0B10]">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 leading-relaxed">{opt}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#3E4253] transition-all group-hover:translate-x-0.5 group-hover:text-[#B4A9FF]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="relative flex shrink-0 items-center justify-center gap-3 border-t border-white/[0.06] px-4 py-3 text-[11px] text-[#555A6E] sm:px-6">
        <span>Tailors the depth of your course · skip anytime</span>
        <span className="hidden items-center gap-1.5 md:inline-flex">
          <span className="h-3 w-px bg-white/10" />
          <Keyboard className="h-3.5 w-3.5" /> Press A–D to answer
        </span>
      </div>
    </div>
  );
}