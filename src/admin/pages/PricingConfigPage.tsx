"use client";

import { useEffect, useState } from "react";
import { PageMeta } from "@/components/PageMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import {
  getAdminPricingConfig,
  updateAdminPricingConfig,
} from "../../api/CourseApi";
import type { CourseTier, CreditPack } from "../../api/CourseApi";

// A simple admin form for tuning course-tier/credit-pack pricing without a
// redeploy — deliberately minimal (edit fields, one Save button per table)
// rather than a full CRUD UI, matching the scope this was asked for. Access
// control is entirely server-side (requireAdmin on GET/PUT /api/admin/
// pricing-config) — a non-admin hitting this page just sees the fetch fail.

function numberInput(value: number, onChange: (v: number) => void, className = "") {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm ${className}`}
    />
  );
}

export default function PricingConfigPage() {
  const [courseTiers, setCourseTiers] = useState<CourseTier[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    getAdminPricingConfig()
      .then((cfg) => { setCourseTiers(cfg.courseTiers); setCreditPacks(cfg.creditPacks); })
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
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const result = await updateAdminPricingConfig(courseTiers, creditPacks);
      setCourseTiers(result.courseTiers);
      setCreditPacks(result.creditPacks);
      setSavedAt(Date.now());
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to save pricing config.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta title="Pricing Config | Admin" noindex />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pricing Config</h1>
            <p className="text-sm text-muted-foreground mt-1">Course tiers and credit packs — changes take effect immediately, no redeploy.</p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-2" /> Save all changes</>}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
        {savedAt && <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">Saved.</p>}

        <Card className="border-0 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Course Tiers</CardTitle>
            <Button variant="outline" size="sm" onClick={addTier}><Plus className="h-3.5 w-3.5 mr-1" /> Add tier</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-slate-100">
                  <th className="pb-2 pr-2">Key</th>
                  <th className="pb-2 pr-2">Name</th>
                  <th className="pb-2 pr-2">Description</th>
                  <th className="pb-2 pr-2 w-20">Lessons</th>
                  <th className="pb-2 pr-2 w-20">MCQ</th>
                  <th className="pb-2 pr-2 w-24">Minutes</th>
                  <th className="pb-2 pr-2 w-24">Credits</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {courseTiers.map((t, i) => (
                  <tr key={t.key} className="border-b border-slate-50 align-top">
                    <td className="py-2 pr-2">
                      <input value={t.key} onChange={(e) => updateTier(i, { key: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono" />
                    </td>
                    <td className="py-2 pr-2">
                      <input value={t.name} onChange={(e) => updateTier(i, { name: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2 py-1.5" />
                    </td>
                    <td className="py-2 pr-2">
                      <input value={t.description} onChange={(e) => updateTier(i, { description: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2 py-1.5" />
                    </td>
                    <td className="py-2 pr-2">{numberInput(t.lessonCount, (v) => updateTier(i, { lessonCount: v }))}</td>
                    <td className="py-2 pr-2">{numberInput(t.mcqCount, (v) => updateTier(i, { mcqCount: v }))}</td>
                    <td className="py-2 pr-2">{numberInput(t.timeAllocationMinutes, (v) => updateTier(i, { timeAllocationMinutes: v }))}</td>
                    <td className="py-2 pr-2">{numberInput(t.creditCost, (v) => updateTier(i, { creditCost: v }))}</td>
                    <td className="py-2">
                      <button onClick={() => setCourseTiers((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Credit Packs</CardTitle>
            <Button variant="outline" size="sm" onClick={addPack}><Plus className="h-3.5 w-3.5 mr-1" /> Add pack</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-slate-100">
                  <th className="pb-2 pr-2">Key</th>
                  <th className="pb-2 pr-2 w-24">Credits</th>
                  <th className="pb-2 pr-2 w-28">Price (cents)</th>
                  <th className="pb-2 pr-2">Badge</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {creditPacks.map((p, i) => (
                  <tr key={p.key} className="border-b border-slate-50">
                    <td className="py-2 pr-2">
                      <input value={p.key} onChange={(e) => updatePack(i, { key: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono" />
                    </td>
                    <td className="py-2 pr-2">{numberInput(p.credits, (v) => updatePack(i, { credits: v }))}</td>
                    <td className="py-2 pr-2">{numberInput(p.priceCents, (v) => updatePack(i, { priceCents: v }))}</td>
                    <td className="py-2 pr-2">
                      <input
                        value={p.badge ?? ""}
                        onChange={(e) => updatePack(i, { badge: e.target.value || null })}
                        placeholder="e.g. Best Value"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5"
                      />
                    </td>
                    <td className="py-2">
                      <button onClick={() => setCreditPacks((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
