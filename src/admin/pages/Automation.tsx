"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, ExternalLink, RefreshCw } from "lucide-react";
import { adminApi } from "../adminApi";
import { PageHeader, LoadingBlock, ErrorBlock, EmptyState, StatusBadge, fmtDate } from "../components";

interface AutomationConfig {
  enabled: boolean;
  frequencyHours: number;
  platforms: string[];
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface AutomationPostRow {
  _id: string;
  topic: string;
  caption: string;
  status: "generating" | "rendering" | "posting" | "posted" | "failed";
  platforms: string[];
  postUrls: { platform: string; url: string }[];
  videoDeletedAt: string | null;
  error: string | null;
  createdAt: string;
}

export default function Automation() {
  const [config, setConfig] = useState<AutomationConfig | null>(null);
  const [posts, setPosts] = useState<AutomationPostRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frequencyInput, setFrequencyInput] = useState("6");
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);

  const load = () => {
    setError(null);
    Promise.all([
      adminApi.get<AutomationConfig>("/api/admin/automation/config"),
      adminApi.get<{ posts: AutomationPostRow[] }>("/api/admin/automation/history"),
    ])
      .then(([cfg, hist]) => {
        setConfig(cfg);
        setFrequencyInput(String(cfg.frequencyHours));
        setPosts(hist.posts);
      })
      .catch((err) => setError(err.message || "Failed to load automation status."));
  };

  useEffect(load, []);

  // Auto-refresh history while anything is still in flight, so a run
  // started here (or by the scheduler) visibly progresses without a manual
  // reload — the same "poll while something's happening" pattern the rest
  // of the app already uses for in-progress course generation.
  useEffect(() => {
    const hasInFlight = posts?.some((p) => p.status === "generating" || p.status === "rendering" || p.status === "posting");
    if (!hasInFlight) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [posts]);

  const handleToggle = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await adminApi.put<AutomationConfig>("/api/admin/automation/config", { enabled: !config.enabled });
      setConfig(updated);
    } catch (err: any) {
      setError(err.message || "Failed to update automation.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFrequency = async () => {
    const hours = Number(frequencyInput);
    if (!Number.isFinite(hours) || hours < 1) {
      setError("Frequency must be a number of at least 1 hour.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.put<AutomationConfig>("/api/admin/automation/config", { frequencyHours: hours });
      setConfig(updated);
    } catch (err: any) {
      setError(err.message || "Failed to update frequency.");
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    setRunningNow(true);
    setError(null);
    try {
      await adminApi.post("/api/admin/automation/run-now");
      // Give the backend a moment to create the AutomationPost row, then
      // reload — the auto-refresh effect above takes over from here.
      setTimeout(load, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to start a run.");
    } finally {
      setRunningNow(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="TikTok Automation"
        sub="Picks a STEM topic, generates a 1-lesson course, renders it, and posts it to TikTok — on its own schedule."
      />

      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}

      {!config ? (
        <LoadingBlock />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <p className="text-sm font-semibold text-slate-800">Status</p>
              <p className={`text-xs mt-0.5 ${config.enabled ? "text-emerald-600" : "text-slate-400"}`}>
                {config.enabled ? "Running" : "Paused"}
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                config.enabled ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {config.enabled ? "Pause automation" : "Enable automation"}
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Frequency (hours)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={frequencyInput}
                  onChange={(e) => setFrequencyInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSaveFrequency}
                  disabled={saving || frequencyInput === String(config.frequencyHours)}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 shrink-0"
                >
                  Save
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Last run</label>
              <p className="text-sm text-slate-700 py-2">{config.lastRunAt ? fmtDate(config.lastRunAt) : "Never"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Next run</label>
              <p className="text-sm text-slate-700 py-2">
                {config.enabled ? (config.nextRunAt ? fmtDate(config.nextRunAt) : "—") : "Paused"}
              </p>
            </div>
          </div>

          <button
            onClick={handleRunNow}
            disabled={runningNow}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {runningNow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run a cycle now
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-800">History</h2>
        <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg" title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {posts === null ? (
        <LoadingBlock />
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8"><EmptyState label="automation runs" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 font-medium">Topic</th>
                <th className="px-5 py-3 font-medium">Caption</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {posts.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50 align-top">
                  <td className="px-5 py-3 font-medium text-slate-800 max-w-[220px]">{p.topic}</td>
                  <td className="px-5 py-3 text-slate-500 max-w-[320px]">
                    <p className="line-clamp-2">{p.caption}</p>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={p.status} />
                    {p.status === "failed" && p.error && (
                      <p className="text-[11px] text-red-500 mt-1 max-w-[180px]">{p.error}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                  <td className="px-5 py-3">
                    {p.postUrls?.[0]?.url && (
                      <a
                        href={p.postUrls[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg inline-flex"
                        title="View on TikTok"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
