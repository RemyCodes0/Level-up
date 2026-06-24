"use client";

import { useState, useRef, useEffect } from "react";
import { Brain, Loader2, ChevronRight, SkipForward } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

type Turn = { intro: string; question: string; options: string[]; answer: string };

interface ChatMessage {
  role: "ai" | "user";
  text: string;
  options?: string[];   // only on AI question messages
  answered?: boolean;   // becomes true once the user picks
}

interface LevelAssessmentChatProps {
  topic: string;
  onComplete: (level: "beginner" | "intermediate" | "advanced" | null) => void;
  onSkip: () => void;
}

// A short, conversational, adaptive level check shown before course
// generation. Streams the AI's questions token-by-token, lets the user
// answer via tappable MCQ options, and ends by telling the parent what
// level was determined (or null if skipped/failed).
export function LevelAssessmentChat({ topic, onComplete, onSkip }: LevelAssessmentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<string[] | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{ intro: string; question: string; options: string[]; isLast: boolean } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 4 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Kick off the first question on mount (guard against double-run in strict mode).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fetchNextQuestion([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streams the next question over SSE, appending tokens live into a new AI
  // message bubble, then enabling the tappable options when the "done" event
  // arrives.
  const fetchNextQuestion = async (currentTurns: Turn[]) => {
    setStreaming(true);
    setCurrentOptions(null);

    // Add an empty AI bubble that we'll stream text into.
    setMessages((prev) => [...prev, { role: "ai", text: "" }]);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/assessment/next-question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ topic, turns: currentTurns }),
      });

      if (!res.ok || !res.body) throw new Error("Failed to start assessment stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Accumulates the visible streamed text. We DON'T show the raw JSON —
      // we show a cleaned, conversational version. To keep it simple and
      // robust, we stream the raw tokens into a hidden accumulator, and
      // render a "typing" state, then swap in the clean parsed text on done.
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
            // While streaming we show a simple animated placeholder rather
            // than raw JSON tokens (which would look like gibberish). The
            // real readable text appears on "done".
          } else if (event === "done") {
            // Replace the streaming bubble with the clean intro + question.
            const cleanText = `${data.intro ? data.intro + " " : ""}${data.question}`;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "ai",
                text: cleanText,
                options: data.options,
                answered: false,
              };
              return next;
            });
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
      // Non-fatal — let them skip into the course without a level.
      setMessages((prev) => {
        const next = [...prev];
        // Replace the empty/failed bubble with a graceful message.
        next[next.length - 1] = {
          role: "ai",
          text: "Hmm, I couldn't load that — no worries, let's just jump into your course.",
        };
        return next;
      });
      setTimeout(() => onComplete(null), 1200);
    } finally {
      setStreaming(false);
    }
  };

  // User taps an answer.
  const handleAnswer = async (option: string) => {
    if (!pendingQuestion) return;

    // Show their answer as a user bubble + lock the options on the question.
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
      // Wrap up: determine level.
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
      const level: "beginner" | "intermediate" | "advanced" | null = data.level ?? null;

      const levelLabel =
        level === "advanced" ? "an advanced level" :
        level === "intermediate" ? "an intermediate level" :
        level === "beginner" ? "a beginner-friendly level" :
        "the right level";

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "ai",
          text: `Perfect — I'll build your course at ${levelLabel}. Let's go! 🚀`,
        };
        return next;
      });

      setTimeout(() => onComplete(level), 1600);
    } catch (err) {
      console.error("Failed to determine level:", err);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "ai", text: "All set — let's start your course!" };
        return next;
      });
      setTimeout(() => onComplete(null), 1400);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-2 rounded-xl">
                <img src="/logo.png" alt="Level Up Logo" className="h-8 w-8 object-cover rounded-lg" />
              </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">Quick level check</p>
            <p className="text-xs text-slate-400">
              {progress.current > 0 ? `Question ${progress.current} of ${progress.total}` : "Getting started…"}
            </p>
          </div>
        </div>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors shrink-0"
        >
          <SkipForward className="h-3.5 w-3.5" /> Skip
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
        {messages.map((m, i) => {
          const isLastAi = m.role === "ai" && i === messages.length - 1;
          const showTyping = isLastAi && m.text === "" && (streaming || finishing);
          return (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}
              >
                {showTyping ? (
                  <span className="flex items-center gap-1 py-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                ) : (
                  m.text
                )}
              </div>
            </div>
          );
        })}

        {/* Tappable answer options for the current question */}
        {currentOptions && !streaming && (
          <div className="flex flex-col gap-2 pt-1">
            {currentOptions.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(opt)}
                className="group flex items-center justify-between text-left w-full sm:w-auto sm:self-start sm:max-w-[80%] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex w-5 h-5 rounded-full border border-slate-300 text-xs items-center justify-center font-semibold text-slate-500 group-hover:border-blue-400 group-hover:text-blue-600 shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 sm:px-6 py-3 border-t border-slate-100">
        <p className="text-center text-xs text-slate-400">
          This quick check helps tailor your course. You can skip it anytime.
        </p>
      </div>
    </div>
  );
}