import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { PageMeta } from "@/components/PageMeta";

type Mode = "individual" | "broadcast";
type Counts = { all: number; unsubscribed: number };
type Job = {
  id: string; total: number; sent: number; failed: number;
  status: "running" | "done" | "error"; errors: { email: string; error: string }[];
};

const API = import.meta.env.VITE_API_URL;
const PREVIEW_NAME = "Alex"; // sample value for {{name}} in the preview

// The Body field accepts either hand-authored HTML or plain text. Plain text
// typed with Enter for paragraph breaks was being sent to the browser/email
// client as literal "\n\n" inside the HTML body — and HTML collapses
// whitespace by default, so every paragraph rendered as one continuous line.
// This converts blank-line-separated plain text into real <p>/<br> markup so
// Enter actually produces visible breaks. If the admin already typed real
// HTML (starts with/contains a block-level tag), it's trusted as-is and
// passed through untouched — this field has always doubled as a raw-HTML
// input for anyone who wants full control.
function toEmailHtml(raw: string): string {
  const trimmed = raw.trim();
  if (/<(p|div|h[1-6]|ul|ol|li|table|br|blockquote)[\s>]/i.test(trimmed)) {
    return raw;
  }
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return trimmed
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export default function EmailComposerPage() {
  const token = localStorage.getItem("token");
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const [mode, setMode] = useState<Mode>("individual");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);

  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    axios.get(`${API}/api/admin/email/recipients`, auth)
      .then((r) => setCounts(r.data))
      .catch(() => setCounts(null));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audienceCount = counts ? counts.all : null;

  // Build the exact document the recipient will see: {{name}} filled in, and —
  // for broadcasts only — the same unsubscribe footer the backend appends. It's
  // rendered inside a sandboxed iframe so the email's own CSS can't leak into
  // the admin UI, and so the preview matches a real mail client's isolation.
  const previewDoc = useMemo(() => {
    const filled = (body ? toEmailHtml(body) : "<p style='color:#94a3b8'>Your email preview will appear here…</p>")
      .replace(/\{\{\s*name\s*\}\}/g, PREVIEW_NAME);
    const footer = mode === "broadcast"
      ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
           You're receiving this because you have a Level Up account. <a href="#" style="color:#6366f1;">Unsubscribe</a>.
         </div>`
      : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;background:#ffffff;font-size:15px;line-height:1.6;">
        ${filled}${footer}
      </body></html>`;
  }, [body, mode]);

  const pollJob = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API}/api/admin/email/job/${jobId}`, auth);
        setJob(data);
        if (data.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSending(false);
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        setSending(false);
      }
    }, 1500);
  };

  const send = async (sendMode: "individual" | "test" | "broadcast") => {
    setStatus(null);
    setJob(null);

    if (!subject.trim()) return setStatus({ type: "err", msg: "Add a subject before sending." });
    if (!body.trim()) return setStatus({ type: "err", msg: "Write the email body before sending." });
    if (sendMode === "individual" && !/^\S+@\S+\.\S+$/.test(to))
      return setStatus({ type: "err", msg: "Enter a valid recipient email address." });

    if (sendMode === "broadcast") {
      const n = audienceCount ?? 0;
      if (!window.confirm(`Send this to ${n.toLocaleString()} users? This can't be undone.`))
        return;
    }

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        mode: sendMode, subject, html: toEmailHtml(body), text: body.replace(/<[^>]+>/g, ""),
      };
      if (sendMode === "individual") payload.to = to;

      const { data } = await axios.post(`${API}/api/admin/email/send`, payload, auth);

      if (sendMode === "broadcast" && data.jobId) {
        setStatus({ type: "ok", msg: `Broadcast started — sending to ${data.total.toLocaleString()} recipients.` });
        pollJob(data.jobId);
      } else {
        setStatus({ type: "ok", msg: `Sent to ${data.sentTo}.` });
        setSending(false);
      }
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : "Send failed";
      setStatus({ type: "err", msg });
      setSending(false);
    }
  };

  const progress = job ? (job.total ? ((job.sent + job.failed) / job.total) * 100 : 0) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <PageMeta title="Admin — Compose Email | Level Up AI" noindex />
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-400/80">Admin</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Compose email</h1>
          <p className="text-slate-400 text-sm mt-1.5">
            Message one person, or broadcast to a segment of your users.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* ── Left: composer ─────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Mode segmented control */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-900 border border-slate-800 p-1">
              {(["individual", "broadcast"] as Mode[]).map((m) => (
                <button key={m} onClick={() => { setMode(m); setStatus(null); }}
                  className={`rounded-xl py-2.5 text-sm font-semibold capitalize transition-all ${
                    mode === m
                      ? m === "broadcast"
                        ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                        : "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
                      : "text-slate-400 hover:text-slate-200"}`}>
                  {m === "broadcast" ? "Broadcast" : "Individual"}
                </button>
              ))}
            </div>

            {/* Recipient */}
            {mode === "individual" ? (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">To</label>
                <input type="email" value={to} onChange={(e) => setTo(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-3 text-sm outline-none transition-colors focus:border-indigo-500/60 focus:bg-slate-900" />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Audience</label>
                <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-3">
                  <div className="text-lg font-bold tabular-nums text-amber-200">
                    {counts ? counts.all.toLocaleString() : "—"}
                  </div>
                  <div className="text-[11px] text-slate-500">all users</div>
                </div>
                {counts && counts.unsubscribed > 0 && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    {counts.unsubscribed.toLocaleString()} unsubscribed {counts.unsubscribed === 1 ? "user is" : "users are"} excluded automatically.
                  </p>
                )}
              </div>
            )}

            {/* Subject */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="What's this about?"
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-3 text-sm outline-none transition-colors focus:border-indigo-500/60" />
            </div>

            {/* Body */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-400">Body</label>
                <span className="text-[11px] text-slate-600">Plain text or HTML · blank line = new paragraph · {"{{name}}"} → recipient's name</span>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12}
                placeholder={"Hey {{name}},\n\nWe just shipped something new…"}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-3 text-[13px] leading-relaxed outline-none transition-colors focus:border-indigo-500/60 font-mono resize-y" />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button onClick={() => send("test")} disabled={sending}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-40">
                Send test to me
              </button>
              {mode === "individual" ? (
                <button onClick={() => send("individual")} disabled={sending}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 text-white hover:bg-indigo-400 transition-colors disabled:opacity-40">
                  {sending ? "Sending…" : "Send email"}
                </button>
              ) : (
                <button onClick={() => send("broadcast")} disabled={sending || !audienceCount}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors disabled:opacity-40">
                  {sending ? "Sending…" : `Broadcast to ${audienceCount?.toLocaleString() ?? "…"}`}
                </button>
              )}
            </div>

            {/* Status */}
            {status && (
              <div className={`rounded-xl px-4 py-3 text-sm ${
                status.type === "ok" ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
                                     : "bg-red-500/10 text-red-300 ring-1 ring-red-500/20"}`}>
                {status.msg}
              </div>
            )}

            {/* Broadcast progress */}
            {job && (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                <div className="flex justify-between items-center text-sm mb-2.5">
                  <span className="font-semibold flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${
                      job.status === "running" ? "bg-amber-400 animate-pulse" : job.status === "done" ? "bg-emerald-400" : "bg-red-400"}`} />
                    {job.status === "running" ? "Sending" : job.status === "done" ? "Sent" : "Finished with errors"}
                  </span>
                  <span className="text-slate-500 tabular-nums">{(job.sent + job.failed).toLocaleString()} / {job.total.toLocaleString()}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-1.5 bg-amber-400 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  {job.sent.toLocaleString()} delivered{job.failed > 0 ? ` · ${job.failed.toLocaleString()} failed` : ""}.
                </p>
                {job.failed > 0 && job.errors.length > 0 && (
                  <details className="mt-2 text-[11px] text-slate-500">
                    <summary className="cursor-pointer hover:text-slate-400">View sample errors</summary>
                    <ul className="mt-1.5 space-y-1 font-mono">
                      {job.errors.map((e, i) => <li key={i} className="truncate">{e.email} — {e.error}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* ── Right: live inbox preview ──────────────────────────────── */}
          <div className="lg:sticky lg:top-8">
            <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
              Preview
              <span className="text-slate-600">— exactly what recipients see</span>
            </div>
            <div className="rounded-2xl bg-white shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-black/5">
              {/* Inbox chrome */}
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-indigo-500 text-white grid place-items-center text-sm font-bold shrink-0">L</div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">Level Up</div>
                    <div className="text-[11px] text-slate-500 truncate">to {mode === "individual" ? (to || "recipient") : `${PREVIEW_NAME.toLowerCase()}@example.com`}</div>
                  </div>
                </div>
                <div className="text-[15px] font-semibold text-slate-900 mt-3 truncate">
                  {subject || <span className="text-slate-400 font-normal">No subject yet</span>}
                </div>
              </div>
              {/* Rendered email, isolated in an iframe */}
              <iframe
                title="Email preview"
                srcDoc={previewDoc}
                className="w-full h-[460px] bg-white border-0"
                sandbox=""
              />
            </div>
            <p className="text-[11px] text-slate-600 mt-2 text-center">
              {mode === "broadcast" ? "Broadcasts include an unsubscribe link (shown above)." : `“{{name}}” shows as “${PREVIEW_NAME}” here.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );   
} 