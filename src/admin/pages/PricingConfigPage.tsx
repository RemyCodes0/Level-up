"use client";

import { useEffect, useState } from "react";
import { PageMeta } from "@/components/PageMeta";
import { Loader2, Save, Plus, Trash2, Check, AlertTriangle, Layers, Coins, Gift } from "lucide-react";
import {
  getAdminPricingConfig,
  updateAdminPricingConfig,
  updateFreeMode,
} from "../../api/CourseApi";
import type { AdminFreeMode, CourseTier, CreditPack } from "../../api/CourseApi";
import { Page, PageHeader, Card, LoadingBlock } from "../components";
import { BTN_PRIMARY, BTN_SOFT, EYEBROW, cx } from "../theme";

// A simple admin form for tuning course-tier/credit-pack pricing without a
// redeploy — deliberately minimal (edit fields, one Save button for the whole
// page) rather than a full CRUD UI, matching the scope this was asked for.
// Access control is entirely server-side (requireAdmin on GET/PUT /api/admin/
// pricing-config) — a non-admin hitting this page just sees the fetch fail.

// Inputs sit inside dense table cells, so they're a size down from the
// standard INPUT token rather than reusing it.
const CELL_INPUT =
  "w-full rounded-lg bg-[#0C0D13] px-2.5 py-1.5 text-[13px] text-[#ECEDF2] placeholder:text-[#4A4F63] ring-1 ring-inset ring-white/[0.08] outline-none transition-colors focus:ring-[#8B7CFF]/60";

function NumberCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx(CELL_INPUT, "tabular-nums")}
    />
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cx(EYEBROW, "px-2 pb-2.5 text-left", className)}>{children}</th>;
}

const isValidLimit = (limit: number) => Number.isInteger(limit) && limit >= 1;

function FreeModeCard({ freeMode, onChange, limit, setLimit }: {
  freeMode: AdminFreeMode;
  onChange: (f: AdminFreeMode) => void;
  limit: number;
  setLimit: (limit: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const limitChanged = limit !== freeMode.dailyLessonLimit;

  const apply = async (patch: { enabled?: boolean; dailyLessonLimit?: number }, done: (extended: number) => string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateFreeMode(patch);
      onChange(result.freeMode);
      setLimit(result.freeMode.dailyLessonLimit);
      setMessage(done(result.bonusesExtended));
      setConfirming(false);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to update free mode.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Free mode" icon={<Gift className="h-4 w-4" />}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#ECEDF2]">
            <span className={cx("h-2 w-2 shrink-0 rounded-full", freeMode.enabled ? "bg-[#3DDC97]" : "bg-[#4A4F63]")} />
            {freeMode.enabled
              ? `Level Up is free for everyone${freeMode.startedAt ? ` since ${new Date(freeMode.startedAt).toLocaleString()}` : ""}`
              : "Off: courses cost credits as usual"}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#8A8FA3]">
            While it's on, every course is free and credits and prices are hidden. Nobody's balance changes, so everyone has
            the same credits when you switch it off, and signup bonus expiry dates are pushed back by the time it was on.
            Generating courses still costs you real AI money the whole time.
          </p>
          <form
            className="mt-4 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (limitChanged && !busy && isValidLimit(limit)) apply({ dailyLessonLimit: limit }, () => "Limit saved.");
            }}
          >
            <label htmlFor="free-limit" className="text-[13px] text-[#B9BCCB]">Lessons per user, per 24 hours</label>
            <input
              id="free-limit"
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className={cx(CELL_INPUT, "w-20 tabular-nums")}
            />
            {limitChanged && (
              <button
                type="submit"
                disabled={busy || !isValidLimit(limit)}
                className={cx(BTN_SOFT, "h-8 px-3 text-xs")}
              >
                Save limit
              </button>
            )}
          </form>
          <p className="mt-1.5 text-[12px] text-[#6E7389]">Also limited to 2 courses building at once per user. A limit under 6 blocks Full Mastery.</p>
          {message && <p className="mt-3 flex items-center gap-2 text-[13px] text-[#3DDC97]"><Check className="h-4 w-4 shrink-0" /> {message}</p>}
          {error && <p className="mt-3 flex items-center gap-2 text-[13px] text-[#FF8A95]"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:w-56">
          {confirming ? (
            <>
              <button
                onClick={() =>
                  apply({ enabled: !freeMode.enabled }, (extended) =>
                    freeMode.enabled
                      ? `Credits are back on. Signup bonus expiry pushed back for ${extended} user${extended !== 1 ? "s" : ""}.`
                      : "Level Up is now free for everyone."
                  )
                }
                disabled={busy}
                className={BTN_PRIMARY}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {freeMode.enabled ? "Yes, bring credits back" : "Yes, make it free"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={busy} className={BTN_SOFT}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className={freeMode.enabled ? BTN_SOFT : BTN_PRIMARY}>
              {freeMode.enabled ? "Back to credits" : "Make Level Up free"}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function PricingConfigPage() {
  const [courseTiers, setCourseTiers] = useState<CourseTier[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [freeMode, setFreeMode] = useState<AdminFreeMode | null>(null);
  const [freeLimit, setFreeLimit] = useState(6);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    getAdminPricingConfig()
      .then((cfg) => { setCourseTiers(cfg.courseTiers); setCreditPacks(cfg.creditPacks); setFreeMode(cfg.freeMode); setFreeLimit(cfg.freeMode.dailyLessonLimit); })
      .catch((err) => { console.error(err); setError(err.message || "Failed to load pricing config — are you an admin?"); })
      .finally(() => setLoading(false));
  }, []);

  const updateTier = (i: number, patch: Partial<CourseTier>) => {
    setCourseTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  const updatePack = (i: number, patch: Partial<CreditPack>) => {
    setCreditPacks((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const addTier = () => {
    setCourseTiers((prev) => [
      ...prev,
      { key: `tier_${Date.now()}`, name: "New Tier", description: "", lessonCount: 1, mcqCount: 10, timeAllocationMinutes: 10, creditCost: 20 },
    ]);
  };
  const addPack = () => {
    setCreditPacks((prev) => [...prev, { key: `pack_${Date.now()}`, credits: 100, priceCents: 299, badge: null }]);
  };

  const handleSave = async () => {
    setError(null);
    setSavedAt(null);
    if (!isValidLimit(freeLimit)) {
      setError("The free lesson limit must be a whole number of at least 1.");
      return;
    }
    setSaving(true);
    try {
      const result = await updateAdminPricingConfig(courseTiers, creditPacks);
      setCourseTiers(result.courseTiers);
      setCreditPacks(result.creditPacks);
      if (freeMode && freeLimit !== freeMode.dailyLessonLimit) {
        const updated = await updateFreeMode({ dailyLessonLimit: freeLimit });
        setFreeMode(updated.freeMode);
        setFreeLimit(updated.freeMode.dailyLessonLimit);
      }
      setSavedAt(Date.now());
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to save pricing config.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <Page max="7xl">
      <PageMeta title="Pricing Config | Admin" noindex />
      <PageHeader
        title="Pricing Config"
        sub="Course tiers and credit packs — changes take effect immediately, no redeploy."
        right={
          <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save all changes</>}
          </button>
        }
      />

      {error && (
        <p className="mb-5 flex items-start gap-2 rounded-xl bg-[#FF5C6C]/10 px-4 py-3 text-[13px] text-[#FF8A95] ring-1 ring-inset ring-[#FF5C6C]/25">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="mb-5 flex items-center gap-2 rounded-xl bg-[#3DDC97]/10 px-4 py-3 text-[13px] text-[#3DDC97] ring-1 ring-inset ring-[#3DDC97]/25">
          <Check className="h-4 w-4 shrink-0" /> Saved — live for every new course.
        </p>
      )}

      <div className="space-y-5">
        {freeMode && <FreeModeCard freeMode={freeMode} onChange={setFreeMode} limit={freeLimit} setLimit={setFreeLimit} />}

        <Card
          title="Course tiers"
          icon={<Layers className="h-4 w-4" />}
          action={
            <button onClick={addTier} className={cx(BTN_SOFT, "h-8 px-3 text-xs")}>
              <Plus className="h-3.5 w-3.5" /> Add tier
            </button>
          }
        >
          <div className="ad-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>Key</Th>
                  <Th>Name</Th>
                  <Th>Description</Th>
                  <Th className="w-[86px]">Lessons</Th>
                  <Th className="w-[86px]">MCQ</Th>
                  <Th className="w-[96px]">Minutes</Th>
                  <Th className="w-[96px]">Credits</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {courseTiers.map((t, i) => (
                  <tr key={t.key} className="border-b border-white/[0.04] align-top last:border-0">
                    <td className="px-2 py-2">
                      <input value={t.key} onChange={(e) => updateTier(i, { key: e.target.value })} className={cx(CELL_INPUT, "font-mono text-[11px]")} />
                    </td>
                    <td className="px-2 py-2">
                      <input value={t.name} onChange={(e) => updateTier(i, { name: e.target.value })} className={CELL_INPUT} />
                    </td>
                    <td className="px-2 py-2">
                      <input value={t.description} onChange={(e) => updateTier(i, { description: e.target.value })} className={CELL_INPUT} />
                    </td>
                    <td className="px-2 py-2"><NumberCell value={t.lessonCount} onChange={(v) => updateTier(i, { lessonCount: v })} /></td>
                    <td className="px-2 py-2"><NumberCell value={t.mcqCount} onChange={(v) => updateTier(i, { mcqCount: v })} /></td>
                    <td className="px-2 py-2"><NumberCell value={t.timeAllocationMinutes} onChange={(v) => updateTier(i, { timeAllocationMinutes: v })} /></td>
                    <td className="px-2 py-2"><NumberCell value={t.creditCost} onChange={(v) => updateTier(i, { creditCost: v })} /></td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setCourseTiers((prev) => prev.filter((_, idx) => idx !== i))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-[#FF5C6C]/10 hover:text-[#FF8A95]"
                        title="Remove tier"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Credit packs"
          icon={<Coins className="h-4 w-4" />}
          action={
            <button onClick={addPack} className={cx(BTN_SOFT, "h-8 px-3 text-xs")}>
              <Plus className="h-3.5 w-3.5" /> Add pack
            </button>
          }
        >
          <div className="ad-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>Key</Th>
                  <Th className="w-[96px]">Credits</Th>
                  <Th className="w-[120px]">Price (cents)</Th>
                  <Th>Badge</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {creditPacks.map((p, i) => (
                  <tr key={p.key} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-2 py-2">
                      <input value={p.key} onChange={(e) => updatePack(i, { key: e.target.value })} className={cx(CELL_INPUT, "font-mono text-[11px]")} />
                    </td>
                    <td className="px-2 py-2"><NumberCell value={p.credits} onChange={(v) => updatePack(i, { credits: v })} /></td>
                    <td className="px-2 py-2"><NumberCell value={p.priceCents} onChange={(v) => updatePack(i, { priceCents: v })} /></td>
                    <td className="px-2 py-2">
                      <input
                        value={p.badge ?? ""}
                        onChange={(e) => updatePack(i, { badge: e.target.value || null })}
                        placeholder="e.g. Best Value"
                        className={CELL_INPUT}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setCreditPacks((prev) => prev.filter((_, idx) => idx !== i))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6E7389] transition-colors hover:bg-[#FF5C6C]/10 hover:text-[#FF8A95]"
                        title="Remove pack"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Page>
  );
}
