"use client";

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/navbar/Navbar";
import { PageMeta } from "@/components/PageMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Coins, Gift, ShoppingCart, RefreshCcw, ArrowDownCircle, ArrowUpCircle, Clock } from "lucide-react";
import { getCreditsBalance, getTransactions } from "../api/CourseApi";
import type { CreditsBalance, CreditTransactionEntry } from "../api/CourseApi";
import { ReferralCard } from "../components/ReferralCard";

const SOURCE_LABEL: Record<CreditTransactionEntry["source"], string> = {
  signup_bonus: "Signup bonus",
  referral: "Referral reward",
  purchase: "Credit pack purchase",
  course_generation: "Course generated",
  refund: "Refund (generation failed)",
};

const SOURCE_ICON: Record<CreditTransactionEntry["source"], React.ReactNode> = {
  signup_bonus: <Gift className="h-4 w-4 text-purple-500" />,
  referral: <Gift className="h-4 w-4 text-indigo-500" />,
  purchase: <ShoppingCart className="h-4 w-4 text-emerald-500" />,
  course_generation: <ArrowDownCircle className="h-4 w-4 text-slate-400" />,
  refund: <RefreshCcw className="h-4 w-4 text-amber-500" />,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function CreditsDashboardPage() {
  const router = useNavigate();
  const [balance, setBalance] = useState<CreditsBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransactionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router("/login"); return; }
    Promise.all([getCreditsBalance(), getTransactions()])
      .then(([bal, tx]) => {
        setBalance(bal);
        setTransactions(tx.transactions);
        setHasMore(tx.hasMore);
        setNextCursor(tx.nextCursor);
      })
      .catch((err) => { console.error(err); setError("Failed to load your credits."); })
      .finally(() => setLoading(false));
  }, [router]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const tx = await getTransactions(nextCursor);
      setTransactions((prev) => [...prev, ...tx.transactions]);
      setHasMore(tx.hasMore);
      setNextCursor(tx.nextCursor);
    } catch (err) {
      console.error("Failed to load more transactions:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  const bonusExpiresSoon =
    balance?.signupBonusExpiresAt &&
    balance.signupBonusCredits > 0 &&
    new Date(balance.signupBonusExpiresAt).getTime() > Date.now();

  return (
    <div className="min-h-screen bg-slate-50">
      <PageMeta title="Your Credits | Level Up AI" noindex />
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Coins className="h-6 w-6 text-blue-600" /> Your Credits
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Credits never expire — except your 100 signup credits, which expire 30 days after signup. MCQs are always included free.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available balance</p>
                    <p className="text-4xl font-bold text-slate-900 mt-1">{balance?.spendableBalance ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">credits</p>
                  </div>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => router("/ai_tutor")}>
                    Use your credits
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-muted-foreground">Non-expiring</p>
                    <p className="text-lg font-semibold text-slate-800">{balance?.courseCredits ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Signup bonus
                      {bonusExpiresSoon && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                          <Clock className="h-2.5 w-2.5 mr-1" />
                          expires {formatDate(balance!.signupBonusExpiresAt!)}
                        </Badge>
                      )}
                    </p>
                    <p className="text-lg font-semibold text-slate-800">{balance?.signupBonusCredits ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ReferralCard />

            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base">Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-5 pb-5">No credit activity yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {transactions.map((t) => (
                      <div key={t._id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {SOURCE_ICON[t.source]}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{SOURCE_LABEL[t.source]}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold flex items-center gap-1 justify-end ${t.amount >= 0 ? "text-emerald-600" : "text-slate-600"}`}>
                            {t.amount >= 0 ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                            {t.amount >= 0 ? "+" : ""}{t.amount}
                          </p>
                          <p className="text-xs text-muted-foreground">balance: {t.balanceAfter}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {hasMore && (
                  <div className="p-4 text-center border-t border-slate-100">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Loading…</> : "Load more"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
