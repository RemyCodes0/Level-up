import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Download, Loader2, Calendar, Clock, Palette, Sparkles,
  Clapperboard, ImagePlus, Images, AlertCircle, RotateCcw,
} from "lucide-react";
import { Audio as MediaAudio } from "@remotion/media";
import { PageMeta } from "../components/PageMeta";
import { DynamicPlayer } from "../remotion/DynamicPlayer";
import { useCompilation } from "../remotion/useCompilation";
import { useAdExport } from "./useAdExport";

const API = import.meta.env.VITE_API_URL;

type Status = "queued" | "planning" | "generating" | "ready" | "failed";
type AdStatus = { status: Status; error?: string; code?: string; totalFrames?: number; productName?: string; brandColor?: string; cta?: string };
type AdListItem = { _id: string; productName: string; status: Status; createdAt: string; durationTarget?: number; brandColor?: string; totalFrames?: number };

const STATUS_LABEL: Record<Status, string> = {
  queued: "Queued…",
  planning: "Writing the script…",
  generating: "Recording voiceover & animating…",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_BADGE: Record<Status, string> = {
  ready: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  failed: "text-red-400 bg-red-500/10 border-red-500/20",
  queued: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  planning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  generating: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

export default function AdStudio() {
  const token = localStorage.getItem("token");
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [cta, setCta] = useState("Get started today");
  const [durationTarget, setDurationTarget] = useState<30 | 60>(30);
  const [logo, setLogo] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);

  const [ad, setAd] = useState<AdStatus | null>(null);
  const [adId, setAdId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ads, setAds] = useState<AdListItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadList = () => axios.get(`${API}/api/ads/list`, auth).then((r) => setAds(r.data)).catch(() => {});
  useEffect(() => { loadList(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; /* eslint-disable-next-line */ }, []);

  const poll = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get<AdStatus>(`${API}/api/ads/status/${id}`, auth);
        setAd(data);
        if (data.status === "ready" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(false);
          loadList();
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        setBusy(false);
      }
    }, 2500);
  };

  const generate = async () => {
    setErr(null);
    if (!productName.trim() || !description.trim()) {
      setErr("Add a product name and a description first.");
      return;
    }
    setBusy(true);
    setAd({ status: "queued" });
    try {
      const fd = new FormData();
      fd.append("productName", productName);
      fd.append("description", description);
      fd.append("websiteUrl", websiteUrl);
      fd.append("brandColor", brandColor);
      fd.append("cta", cta);
      fd.append("durationTarget", String(durationTarget));
      if (logo) fd.append("logo", logo);
      screenshots.slice(0, 5).forEach((s) => fd.append("screenshots", s));

      const { data } = await axios.post(`${API}/api/ads/generate`, fd, {
        headers: { ...auth.headers, "Content-Type": "multipart/form-data" },
      });
      setAdId(data.adId);
      poll(data.adId);
    } catch (e) {
      setErr(axios.isAxiosError(e) ? e.response?.data?.error || e.message : "Failed to start");
      setBusy(false);
    }
  };

  const openAd = async (id: string) => {
    setBusy(false);
    setAdId(id);
    const { data } = await axios.get(`${API}/api/ads/${id}`, auth);
    setAd(data);
    if (data.status !== "ready" && data.status !== "failed") { setBusy(true); poll(id); }
  };

  const retry = async () => {
    if (!adId) return;
    setBusy(true); setAd({ status: "queued" });
    await axios.post(`${API}/api/ads/${adId}/retry`, {}, auth);
    poll(adId);
  };

  const inProgress = ad && ad.status !== "ready" && ad.status !== "failed";

  // Compile once with @remotion/media audio so we can export the exact ad.
  const { Component } = useCompilation(ad?.code || "", MediaAudio);
  const { exportAd, cancel, state: exportState, progress: exportProgress, supported: exportSupported } = useAdExport();

  const download = () => {
    if (Component && ad?.totalFrames) {
      exportAd({ component: Component, durationInFrames: ad.totalFrames, title: ad.productName });
    }
  };

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const seconds = ad?.totalFrames ? Math.round(ad.totalFrames / 30) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      <PageMeta title="Ad Studio | Level Up AI" noindex />
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-indigo-600/15 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-purple-600/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff08 1px, transparent 1px), linear-gradient(to bottom, #ffffff08 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto px-5 py-8">
        <div className="mb-9 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
            <Clapperboard className="h-5.5 w-5.5 text-white" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-400/80">Level Up · Studio</div>
            <h1 className="text-3xl font-bold tracking-tight text-white mt-0.5">Ad Studio</h1>
            <p className="text-slate-400 text-sm mt-1.5">Turn your product into a 30–60s animated ad.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[380px,1fr] gap-6 items-start">
          {/* ── Form ── */}
          <div className="rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/70 shadow-xl shadow-black/20 p-5 space-y-4">
            <Field label="Product name">
              <input value={productName} onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Level Up" className={inputCls} />
            </Field>
            <Field label="What is it? (the more specific, the better the ad)">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                placeholder="What it does, who it's for, and the one thing that makes it special."
                className={inputCls} />
            </Field>
            <Field label="Website (optional — we'll read it for detail)">
              <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://…" className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand color" icon={Palette}>
                <div className="flex items-center gap-2">
                  <div className="relative h-10 w-11 shrink-0 rounded-xl border border-slate-800 overflow-hidden bg-slate-900">
                    <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)}
                      className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-0 bg-transparent p-0" />
                  </div>
                  <input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className={`${inputCls} font-mono`} />
                </div>
              </Field>
              <Field label="Length">
                <div className="relative grid grid-cols-2 rounded-xl bg-slate-900/70 border border-slate-800 p-1 h-10">
                  <div
                    className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/30 transition-transform duration-300 ease-out"
                    style={{ transform: durationTarget === 60 ? "translateX(calc(100% + 4px))" : "translateX(0)" }}
                  />
                  {[30, 60].map((d) => (
                    <button key={d} onClick={() => setDurationTarget(d as 30 | 60)}
                      className={`relative z-10 rounded-lg text-sm font-medium transition-colors ${
                        durationTarget === d ? "text-white" : "text-slate-400 hover:text-slate-200"}`}>
                      {d}s
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="Call to action">
              <input value={cta} onChange={(e) => setCta(e.target.value)} className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Logo (optional)">
                <label className="group flex items-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-3 py-2.5 text-xs text-slate-400 cursor-pointer transition-colors hover:border-indigo-500/50 hover:bg-slate-900/70">
                  <ImagePlus className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  <span className="truncate">{logo ? logo.name : "Upload logo"}</span>
                  <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] || null)} className="hidden" />
                </label>
              </Field>
              <Field label="Screenshots (up to 5)">
                <label className="group flex items-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-3 py-2.5 text-xs text-slate-400 cursor-pointer transition-colors hover:border-indigo-500/50 hover:bg-slate-900/70">
                  <Images className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  <span className="truncate">{screenshots.length > 0 ? `${screenshots.length} selected` : "Upload images"}</span>
                  <input type="file" accept="image/*" multiple
                    onChange={(e) => setScreenshots(Array.from(e.target.files || []).slice(0, 5))}
                    className="hidden" />
                </label>
              </Field>
            </div>

            <button onClick={generate} disabled={busy}
              className="group relative w-full py-3.5 rounded-xl text-sm font-semibold text-white overflow-hidden transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5">
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
              <span className="relative inline-flex items-center justify-center gap-2">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate ad</>}
              </span>
            </button>
            {err && (
              <p className="flex items-center gap-1.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}
              </p>
            )}
          </div>

          {/* ── Right column: video → details → recent ── */}
          <div className="lg:sticky lg:top-8 space-y-4">
            {/* Video FIRST */}
            {ad?.status === "ready" && ad.code && ad.totalFrames ? (
              <div className="rounded-xl overflow-hidden border border-slate-800/70 shadow-xl shadow-black/20">
                <DynamicPlayer code={ad.code} durationInFrames={ad.totalFrames} onRetry={retry} />
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/70 shadow-xl shadow-black/20 overflow-hidden aspect-video flex items-center justify-center">
                {ad?.status === "failed" ? (
                  <div className="text-center p-8">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                    </div>
                    <p className="text-red-400 font-medium mb-3">Ad generation failed</p>
                    <button onClick={retry}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm font-medium hover:bg-red-500/20 transition-colors">
                      <RotateCcw className="h-3.5 w-3.5" /> Try again
                    </button>
                  </div>
                ) : inProgress ? (
                  <div className="text-center p-8">
                    <div className="relative mx-auto mb-5 h-12 w-12">
                      <div className="absolute inset-0 rounded-full border-2 border-slate-800" />
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 border-r-indigo-500 animate-spin" />
                    </div>
                    <p className="text-slate-200 text-sm font-medium">{STATUS_LABEL[ad!.status]}</p>
                    <p className="text-slate-500 text-xs mt-1.5">This takes a couple of minutes — keep this tab open.</p>
                  </div>
                ) : (
                  <div className="text-center p-8">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700/50">
                      <Clapperboard className="h-5 w-5 text-slate-500" />
                    </div>
                    <p className="text-slate-500 text-sm">Fill in your product on the left, then generate your ad.</p>
                  </div>
                )}
              </div>
            )}

            {/* Details + download — BELOW the video */}
            {ad?.status === "ready" && (
              <div className="rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/70 shadow-xl shadow-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-100 truncate">{ad.productName}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 text-xs text-slate-400">
                      {seconds != null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-800/40 px-2 py-0.5">
                          <Clock className="h-3 w-3" />{seconds}s
                        </span>
                      )}
                      {ad.brandColor && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-800/40 px-2 py-0.5">
                          <span className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ background: ad.brandColor }} />
                          {ad.brandColor}
                        </span>
                      )}
                      {ad.cta && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-800/40 px-2 py-0.5">
                          <Sparkles className="h-3 w-3" />{ad.cta}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Download */}
                  {exportSupported ? (
                    exportState === "rendering" ? (
                      <button onClick={cancel}
                        className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-200 border border-slate-700">
                        <Loader2 className="h-4 w-4 animate-spin" /> {Math.round(exportProgress * 100)}%
                      </button>
                    ) : (
                      <button onClick={download} disabled={!Component}
                        className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:translate-y-0 disabled:shadow-none">
                        <Download className="h-4 w-4" />
                        {exportState === "done" ? "Saved!" : exportState === "error" ? "Retry" : "Download"}
                      </button>
                    )
                  ) : (
                    <span className="shrink-0 text-[11px] text-slate-500 max-w-[140px] text-right">Download needs Chrome or Firefox</span>
                  )}
                </div>
                {exportState === "error" && <p className="text-xs text-red-400 mt-2">Couldn't render the video here. Try again, or use a different browser.</p>}
                {exportState === "rendering" && <p className="text-[11px] text-slate-500 mt-2">Rendering on your device — keep this tab open.</p>}
              </div>
            )}

            {/* Recent ads (top 5) — below details */}
            {ads.length > 0 && (
              <div className="rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/70 shadow-xl shadow-black/20 p-4">
                <div className="text-xs font-medium text-slate-500 mb-2.5">Recent ads</div>
                <div className="space-y-1.5">
                  {ads.map((a) => (
                    <button key={a._id} onClick={() => openAd(a._id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 border ${
                        adId === a._id
                          ? "bg-slate-800/80 border-slate-700"
                          : "border-transparent hover:bg-slate-800/40 hover:border-slate-800"}`}>
                      <span className="h-8 w-8 rounded-lg shrink-0 border border-white/10" style={{ background: a.brandColor || "#334155" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-200 truncate">{a.productName}</span>
                        <span className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(a.createdAt)}</span>
                          {a.totalFrames ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{Math.round(a.totalFrames / 30)}s</span> : a.durationTarget ? <span>{a.durationTarget}s</span> : null}
                        </span>
                      </span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 px-2 py-0.5 rounded-full border ${STATUS_BADGE[a.status]}`}>
                        {a.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-slate-900/60 border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-all duration-200 focus:border-indigo-500/70 focus:ring-4 focus:ring-indigo-500/10";

function Field({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      {children}
    </label>
  );
}
