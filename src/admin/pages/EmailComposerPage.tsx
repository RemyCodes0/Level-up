import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { PageMeta } from "@/components/PageMeta";
import { Page, PageHeader, Card } from "../components";
import { INPUT, LABEL, BTN_SOFT, BTN_PRIMARY, EYEBROW, cx } from "../theme";

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
    <Page max="7xl">
      <PageMeta title="Admin — Compose Email | Level Up AI" noindex />
      <PageHeader title="Compose email" sub="Message one person, or broadcast to every user who hasn't unsubscribed." />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ── Left: composer ───────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Mode segmented control — full width, since it changes what the
              whole left column means (one recipient vs. everyone). */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#0C0D13] p-1 ring-1 ring-white/[0.07]">
            {(["individual", "broadcast"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setStatus(null); }}
                className={cx(
                  "rounded-xl py-2.5 text-[13px] font-semibold capitalize transition-all",
                  mode === m
                    ? m === "broadcast"
                      ? "bg-[#FFB547]/15 text-[#FFB547] ring-1 ring-inset ring-[#FFB547]/30"
                      : "bg-[#8B7CFF]/15 text-[#B4A9FF] ring-1 ring-inset ring-[#8B7CFF]/30"
                    : "text-[#8A8FA3] hover:bg-white/[0.04] hover:text-white"
                )}
              >
                {m === "broadcast" ? "Broadcast" : "Individual"}
              </button>
            ))}
          </div>

          {/* Recipient */}
          {mode === "individual" ? (
            <div>
              <label className={LABEL}>To</label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="name@example.com"
                className={INPUT}
              />
            </div>
          ) : (
            <div>
              <label className={LABEL}>Audience</label>
              <div className="rounded-xl bg-[#FFB547]/[0.08] px-4 py-3.5 ring-1 ring-inset ring-[#FFB547]/30">
                <div className="text-2xl font-semibold leading-none text-[#FFB547] tabular-nums">
                  {counts ? counts.all.toLocaleString() : "—"}
                </div>
                <div className="mt-1.5 text-[11px] text-[#8A8FA3]">all users</div>
              </div>
              {counts && counts.unsubscribed > 0 && (
                <p className="mt-2 text-[11px] text-[#6E7389]">
                  {counts.unsubscribed.toLocaleString()} unsubscribed {counts.unsubscribed === 1 ? "user is" : "users are"} excluded automatically.
                </p>
              )}
            </div>
          )}

          {/* Subject */}
          <div>
            <label className={LABEL}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?" className={INPUT} />
          </div>

          {/* Body */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <label className={cx(LABEL, "mb-0")}>Body</label>
              <span className="text-[11px] text-[#4A4F63]">
                Plain text or HTML · blank line = new paragraph · {"{{name}}"} → recipient's name
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder={"Hey {{name}},\n\nWe just shipped something new…"}
              className={cx(INPUT, "resize-y font-mono text-[13px] leading-relaxed")}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={() => send("test")} disabled={sending} className={BTN_SOFT}>
              Send test to me
            </button>
            {mode === "individual" ? (
              <button onClick={() => send("individual")} disabled={sending} className={BTN_PRIMARY}>
                {sending ? "Sending…" : "Send email"}
              </button>
            ) : (
              <button
                onClick={() => send("broadcast")}
                disabled={sending || !audienceCount}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#FFB547] px-5 text-[13px] font-semibold text-[#0A0B10] shadow-[0_10px_30px_-10px_rgba(255,181,71,0.8)] transition-colors hover:bg-[#FFC670] disabled:pointer-events-none disabled:opacity-40"
              >
                {sending ? "Sending…" : `Broadcast to ${audienceCount?.toLocaleString() ?? "…"}`}
              </button>
            )}
          </div>

          {/* Status */}
          {status && (
            <div
              className={cx(
                "rounded-xl px-4 py-3 text-[13px] ring-1 ring-inset",
                status.type === "ok"
                  ? "bg-[#3DDC97]/10 text-[#3DDC97] ring-[#3DDC97]/25"
                  : "bg-[#FF5C6C]/10 text-[#FF8A95] ring-[#FF5C6C]/25"
              )}
            >
              {status.msg}
            </div>
          )}

          {/* Broadcast progress */}
          {job && (
            <div className="rounded-2xl bg-[#11131A] p-4 ring-1 ring-white/[0.07]">
              <div className="mb-2.5 flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 font-semibold text-white">
                  <span
                    className={cx(
                      "h-2 w-2 rounded-full",
                      job.status === "running" ? "animate-pulse bg-[#FFB547]" : job.status === "done" ? "bg-[#3DDC97]" : "bg-[#FF5C6C]"
                    )}
                  />
                  {job.status === "running" ? "Sending" : job.status === "done" ? "Sent" : "Finished with errors"}
                </span>
                <span className="tabular-nums text-[#6E7389]">
                  {(job.sent + job.failed).toLocaleString()} / {job.total.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-[#FFB547] transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-[#6E7389]">
                {job.sent.toLocaleString()} delivered{job.failed > 0 ? ` · ${job.failed.toLocaleString()} failed` : ""}.
              </p>
              {job.failed > 0 && job.errors.length > 0 && (
                <details className="mt-2 text-[11px] text-[#6E7389]">
                  <summary className="cursor-pointer transition-colors hover:text-[#D6D8E2]">View sample errors</summary>
                  <ul className="mt-1.5 space-y-1 font-mono">
                    {job.errors.map((e, i) => <li key={i} className="truncate">{e.email} — {e.error}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ── Right: live inbox preview ────────────────────────────────── */}
        <div className="lg:sticky lg:top-8">
          <div className="mb-2 flex items-center gap-2">
            <span className={EYEBROW}>Preview</span>
            <span className="text-[11px] text-[#4A4F63]">exactly what recipients see</span>
          </div>
          {/* Deliberately light: this is a mail client's chrome, not part of
              the dashboard's own surface. */}
          <Card pad={false} className="ring-white/[0.09]">
            <div className="overflow-hidden rounded-[15px]">
              <div className="border-b border-slate-200 bg-slate-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#8B7CFF] text-sm font-bold text-white">L</div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-slate-900">Level Up</div>
                    <div className="truncate text-[11px] text-slate-500">
                      to {mode === "individual" ? (to || "recipient") : `${PREVIEW_NAME.toLowerCase()}@example.com`}
                    </div>
                  </div>
                </div>
                <div className="mt-3 truncate text-[15px] font-semibold text-slate-900">
                  {subject || <span className="font-normal text-slate-400">No subject yet</span>}
                </div>
              </div>
              <iframe
                title="Email preview"
                srcDoc={previewDoc}
                className="h-[460px] w-full border-0 bg-white"
                sandbox=""
              />
            </div>
          </Card>
          <p className="mt-2 text-center text-[11px] text-[#4A4F63]">
            {mode === "broadcast"
              ? "Broadcasts include an unsubscribe link (shown above)."
              : `“{{name}}” shows as “${PREVIEW_NAME}” here.`}
          </p>
        </div>
      </div>
    </Page>
  );
}
